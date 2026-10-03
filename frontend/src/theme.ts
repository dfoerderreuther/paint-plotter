import type { ThemeConfig } from 'antd'

/** Purple colour scheme for the whole app (antd tokens + a few layout colours). */
export const PURPLE = {
  primary: '#7c3aed', // violet 600
  primaryDark: '#5b21b6', // violet 800
  deep: '#2e1065', // violet 950
  soft: '#f3effb', // canvas background
  tint: '#ede9fe', // violet 100, section headers
}

export const HEADER_GRADIENT = `linear-gradient(90deg, ${PURPLE.deep} 0%, ${PURPLE.primaryDark} 70%, ${PURPLE.primary} 100%)`

export const theme: ThemeConfig = {
  token: {
    colorPrimary: PURPLE.primary,
    colorInfo: PURPLE.primary,
    colorLink: PURPLE.primary,
    borderRadius: 8,
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
  components: {
    Layout: { headerBg: PURPLE.deep, siderBg: '#ffffff', bodyBg: PURPLE.soft },
    Collapse: { headerBg: PURPLE.tint, contentBg: '#ffffff', headerPadding: '8px 12px' },
    Tabs: { itemSelectedColor: PURPLE.primary, inkBarColor: PURPLE.primary },
    Table: { headerBg: '#faf8ff', rowSelectedBg: PURPLE.tint, rowSelectedHoverBg: '#e4dcfb' },
    Segmented: { itemSelectedBg: '#ffffff', trackBg: PURPLE.tint },
  },
}
