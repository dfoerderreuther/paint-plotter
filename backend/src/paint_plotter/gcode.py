"""Marlin G-code output for the paint plotter.

Z is only a switch on this machine (Z > 1 up, Z <= 0 down). Every file starts and ends
with the tool up and ends at the park position. There are no pause commands: a pause
means a new file.
"""

from collections.abc import Iterable, Sequence

from paint_plotter.config import PlotterConfig

Point = tuple[float, float]


class GcodeError(ValueError):
    pass


class GcodeWriter:
    def __init__(self, config: PlotterConfig, title: str, tool: str):
        self.config = config
        self._lines: list[str] = [
            f"; Paint Plotter - {title}",
            f"; Tool: {tool}",
            "G21 ; units: mm",
            "G90 ; absolute positioning",
        ]
        self._tool_down = True  # unknown at start: force a lift
        self.up()

    def _fmt(self, v: float) -> str:
        return f"{v:.2f}".rstrip("0").rstrip(".")

    def _check(self, x: float, y: float) -> None:
        wa = self.config.work_area
        eps = 1e-6
        if not (-eps <= x <= wa.width_mm + eps and -eps <= y <= wa.height_mm + eps):
            raise GcodeError(
                f"Move to X{self._fmt(x)} Y{self._fmt(y)} is outside the work area "
                f"({self._fmt(wa.width_mm)} x {self._fmt(wa.height_mm)} mm)"
            )

    def comment(self, text: str) -> None:
        self._lines.append(f"; {text}")

    def up(self) -> None:
        if self._tool_down:
            self._lines.append(f"G0 Z{self._fmt(self.config.z.up)} F{self._fmt(self.config.feed_rates.travel_mm_min)}")
            self._tool_down = False

    def down(self) -> None:
        if not self._tool_down:
            self._lines.append(f"G0 Z{self._fmt(self.config.z.down)} F{self._fmt(self.config.feed_rates.travel_mm_min)}")
            self._tool_down = True

    def travel(self, x: float, y: float) -> None:
        self._check(x, y)
        self.up()
        self._lines.append(f"G0 X{self._fmt(x)} Y{self._fmt(y)} F{self._fmt(self.config.feed_rates.travel_mm_min)}")

    def polyline(self, points: Sequence[Point]) -> None:
        if len(points) < 2:
            return
        for x, y in points:
            self._check(x, y)
        self.travel(*points[0])
        self.down()
        feed = self._fmt(self.config.feed_rates.paint_mm_min)
        for i, (x, y) in enumerate(points[1:]):
            self._lines.append(f"G1 X{self._fmt(x)} Y{self._fmt(y)}" + (f" F{feed}" if i == 0 else ""))
        self.up()

    def polylines(self, lines: Iterable[Sequence[Point]]) -> None:
        for line in lines:
            self.polyline(line)

    def finish(self) -> str:
        park = self.config.park
        self.travel(park.x_mm, park.y_mm)
        self._lines.append("; end")
        return "\n".join(self._lines) + "\n"
