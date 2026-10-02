from pathlib import Path

from fastapi.testclient import TestClient

from paint_plotter.main import app

client = TestClient(app)
SAMPLE = Path(__file__).parent / "data" / "sample.svg"


def create(name):
    return client.post("/api/projects", json={"name": name})


def test_create_load_save(data_dir):
    res = create("My Painting")
    assert res.status_code == 200
    assert res.json()["drawing"] is None
    assert (data_dir / "projects" / "My_Painting" / "project.json").exists()

    project = client.get("/api/projects/My Painting").json()["project"]
    project["placement"] = {"x": 10, "y": 20, "scale": 2}
    project["color_choices"] = {"#ff0000": None}
    project["paint_settings"]["brush_width_mm"] = 5
    assert client.put("/api/projects/My Painting", json=project).status_code == 200

    loaded = client.get("/api/projects/My Painting").json()["project"]
    assert loaded["placement"] == {"x": 10, "y": 20, "scale": 2}
    assert loaded["color_choices"] == {"#ff0000": None}
    assert loaded["paint_settings"]["brush_width_mm"] == 5
    assert loaded["updated"]


def test_create_twice_is_conflict():
    create("a")
    assert create("a").status_code == 409


def test_missing_project_is_404():
    assert client.get("/api/projects/nope").status_code == 404
    assert client.put("/api/projects/nope", json={"name": "nope"}).status_code == 404


def test_svg_is_stored_in_the_project_folder(data_dir):
    create("p")
    res = client.post("/api/projects/p/svg", files={"file": ("cat.svg", SAMPLE.read_bytes(), "image/svg+xml")})
    assert res.status_code == 200
    assert len(res.json()["drawing"]["layers"]) == 5
    assert (data_dir / "projects" / "p" / "drawing.svg").read_bytes() == SAMPLE.read_bytes()
    loaded = client.get("/api/projects/p").json()
    assert loaded["project"]["svg_filename"] == "cat.svg"
    assert len(loaded["drawing"]["layers"]) == 5


def test_broken_svg_does_not_replace_the_stored_one(data_dir):
    create("p")
    client.post("/api/projects/p/svg", files={"file": ("cat.svg", SAMPLE.read_bytes(), "image/svg+xml")})
    res = client.post("/api/projects/p/svg", files={"file": ("bad.svg", b"not svg", "image/svg+xml")})
    assert res.status_code == 422
    assert client.get("/api/projects/p").json()["project"]["svg_filename"] == "cat.svg"


def test_list_newest_first():
    create("first")
    create("second")
    project = client.get("/api/projects/first").json()["project"]
    client.put("/api/projects/first", json=project)  # touch
    names = [p["name"] for p in client.get("/api/projects").json()]
    assert names[0] == "first" and set(names) == {"first", "second"}


def test_rename_moves_folder_and_svg(data_dir):
    create("default")
    client.post("/api/projects/default/svg", files={"file": ("cat.svg", SAMPLE.read_bytes(), "image/svg+xml")})
    res = client.post("/api/projects/default/rename", json={"name": "Cat"})
    assert res.status_code == 200 and res.json()["name"] == "Cat"
    assert not (data_dir / "projects" / "default").exists()
    assert (data_dir / "projects" / "Cat" / "drawing.svg").exists()
    assert client.get("/api/projects/Cat").json()["drawing"] is not None


def test_rename_to_existing_is_conflict():
    create("a")
    create("b")
    assert client.post("/api/projects/a/rename", json={"name": "b"}).status_code == 409


def test_delete(data_dir):
    create("gone")
    assert client.delete("/api/projects/gone").status_code == 204
    assert not (data_dir / "projects" / "gone").exists()
    assert client.delete("/api/projects/gone").status_code == 404


def test_invalid_name():
    assert create("///").status_code == 422
