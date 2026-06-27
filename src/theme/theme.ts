import { createTheme, PaletteOptions } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import type { TradeColor } from "@/theme/tradeColors";
type ThemePreference = string;

// Light palette
const lightPalette: PaletteOptions = {
  mode: "light",
  primary: {
    main: "#1976d2",
    light: "#42a5f5",
    dark: "#1565c0",
    contrastText: "#fff",
  },
  secondary: {
    main: "#dc004e",
    light: "#ff5983",
    dark: "#9a0036",
    contrastText: "#fff",
  },
  success: {
    main: "#2e7d32",
    light: "#4caf50",
    dark: "#1b5e20",
  },
  error: {
    main: "#d32f2f",
    light: "#ef5350",
    dark: "#c62828",
  },
  warning: {
    main: "#ed6c02",
    light: "#ff9800",
    dark: "#e65100",
  },
  info: {
    main: "#0288d1",
    light: "#03a9f4",
    dark: "#01579b",
  },
  background: {
    default: "#f5f5f5",
    paper: "#ffffff",
  },
  text: {
    primary: "rgba(0, 0, 0, 0.87)",
    secondary: "rgba(0, 0, 0, 0.6)",
    disabled: "rgba(0, 0, 0, 0.38)",
  },
  divider: "rgba(0, 0, 0, 0.12)",
  action: {
    hover: "rgba(0, 0, 0, 0.04)",
    selected: "rgba(0, 0, 0, 0.08)",
    disabled: "rgba(0, 0, 0, 0.26)",
  },
};

// Dark palette
const darkPalette: PaletteOptions = {
  mode: "dark",
  primary: {
    main: "#90caf9",
    light: "#e3f2fd",
    dark: "#42a5f5",
    contrastText: "#000",
  },
  secondary: {
    main: "#f48fb1",
    light: "#ffc1e3",
    dark: "#bf5f82",
    contrastText: "#000",
  },
  success: {
    main: "#66bb6a",
    light: "#81c784",
    dark: "#388e3c",
  },
  error: {
    main: "#f44336",
    light: "#e57373",
    dark: "#d32f2f",
  },
  warning: {
    main: "#ffa726",
    light: "#ffb74d",
    dark: "#f57c00",
  },
  info: {
    main: "#29b6f6",
    light: "#4fc3f7",
    dark: "#0288d1",
  },
  background: {
    default: "#121212",
    paper: "#1e1e1e",
  },
  text: {
    primary: "rgba(255, 255, 255, 0.87)",
    secondary: "rgba(255, 255, 255, 0.6)",
    disabled: "rgba(255, 255, 255, 0.38)",
  },
  divider: "rgba(255, 255, 255, 0.12)",
  action: {
    hover: "rgba(255, 255, 255, 0.08)",
    selected: "rgba(255, 255, 255, 0.16)",
    disabled: "rgba(255, 255, 255, 0.3)",
  },
};

// Use light palette as default
const palette = lightPalette;

const theme = createTheme({
  palette,
  typography: {
    fontFamily: [
      "-apple-system",
      "BlinkMacSystemFont",
      '"Segoe UI"',
      "Roboto",
      '"Helvetica Neue"',
      "Arial",
      "sans-serif",
    ].join(","),
    h1: {
      fontSize: "2.5rem",
      fontWeight: 500,
      lineHeight: 1.2,
    },
    h2: {
      fontSize: "2rem",
      fontWeight: 500,
      lineHeight: 1.3,
    },
    h3: {
      fontSize: "1.75rem",
      fontWeight: 500,
      lineHeight: 1.4,
    },
    h4: {
      fontSize: "1.5rem",
      fontWeight: 500,
      lineHeight: 1.4,
    },
    h5: {
      fontSize: "1.25rem",
      fontWeight: 500,
      lineHeight: 1.5,
    },
    h6: {
      fontSize: "1rem",
      fontWeight: 500,
      lineHeight: 1.6,
    },
    subtitle1: {
      fontSize: "1rem",
      fontWeight: 400,
      lineHeight: 1.75,
    },
    subtitle2: {
      fontSize: "0.875rem",
      fontWeight: 500,
      lineHeight: 1.57,
    },
    body1: {
      fontSize: "1rem",
      fontWeight: 400,
      lineHeight: 1.5,
    },
    body2: {
      fontSize: "0.875rem",
      fontWeight: 400,
      lineHeight: 1.43,
    },
    button: {
      fontSize: "0.875rem",
      fontWeight: 500,
      lineHeight: 1.75,
      textTransform: "none",
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 500,
          borderRadius: 8,
          padding: "8px 16px",
          "@media (max-width: 600px)": {
            padding: "6px 12px",
            fontSize: "0.75rem",
          },
        },
        sizeSmall: {
          "@media (max-width: 600px)": {
            padding: "4px 8px",
            fontSize: "0.7rem",
            minWidth: "unset",
          },
        },
        contained: {
          boxShadow: "none",
          "&:hover": {
            boxShadow: "0px 2px 4px rgba(0,0,0,0.1)",
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: "0px 2px 8px rgba(0,0,0,0.08)",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
        elevation1: {
          boxShadow: "0px 2px 4px rgba(0,0,0,0.08)",
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: 8,
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: "0px 1px 3px rgba(0,0,0,0.12)",
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRight: `1px solid ${palette.divider}`,
          boxShadow: "none",
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          padding: "8px 16px",
          borderBottom: "1px solid rgba(0, 0, 0, 0.12)",
          "@media (max-width: 600px)": {
            padding: "4px 8px",
            fontSize: "0.7rem",
          },
        },
        head: {
          fontWeight: 600,
          backgroundColor: "#f5f5f5",
          color: "rgba(0, 0, 0, 0.87)",
          "@media (max-width: 600px)": {
            fontSize: "0.65rem",
            fontWeight: 700,
          },
        },
        body: {
          color: "rgba(0, 0, 0, 0.87)",
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          "&:hover": {
            backgroundColor: "rgba(0, 0, 0, 0.04)",
          },
          "&.Mui-selected": {
            backgroundColor: "rgba(0, 0, 0, 0.08)",
            "&:hover": {
              backgroundColor: "rgba(0, 0, 0, 0.08)",
            },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 500,
          height: 24,
          fontSize: "0.75rem",
          "@media (max-width: 600px)": {
            height: 18,
            fontSize: "0.6rem",
          },
        },
        sizeSmall: {
          "@media (max-width: 600px)": {
            height: 16,
            fontSize: "0.55rem",
          },
        },
        filled: {
          backgroundColor: "#1976d2",
          color: "#fff",
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          color: "#1976d2",
          "&:hover": {
            backgroundColor: "rgba(0, 0, 0, 0.04)",
          },
        },
        sizeSmall: {
          padding: "4px",
        },
      },
    },
    MuiDialog: {
      defaultProps: {
        disableScrollLock: true,
      },
      styleOverrides: {
        paper: {
          borderRadius: 12,
        },
      },
    },
    MuiModal: {
      defaultProps: {
        disableScrollLock: true,
      },
    },
    MuiPopover: {
      defaultProps: {
        disableScrollLock: true,
      },
    },
    MuiMenu: {
      defaultProps: {
        disableScrollLock: true,
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
  },
});

// Default Material React Table configuration
export const defaultTableConfig = {
  enableDensityToggle: false, // Disable density toggle
  enableColumnActions: true,
  enableColumnFilterModes: true,
  enableSorting: true,
  enablePagination: true,
  enableColumnFilters: true,
  enableGlobalFilter: true,
  initialState: {
    density: "compact" as const, // Set default to compact view
    pagination: { pageSize: 20, pageIndex: 0 },
  },
};

// Function to create theme based on mode
export function createAppTheme(mode: ThemePreference) {
  const selectedPalette = mode === "dark" ? darkPalette : lightPalette;

  return createTheme({
    palette: selectedPalette,
    typography: {
      fontFamily: [
        "-apple-system",
        "BlinkMacSystemFont",
        '"Segoe UI"',
        "Roboto",
        '"Helvetica Neue"',
        "Arial",
        "sans-serif",
      ].join(","),
      h1: {
        fontSize: "2.5rem",
        fontWeight: 500,
        lineHeight: 1.2,
      },
      h2: {
        fontSize: "2rem",
        fontWeight: 500,
        lineHeight: 1.3,
      },
      h3: {
        fontSize: "1.75rem",
        fontWeight: 500,
        lineHeight: 1.4,
      },
      h4: {
        fontSize: "1.5rem",
        fontWeight: 500,
        lineHeight: 1.4,
      },
      h5: {
        fontSize: "1.25rem",
        fontWeight: 500,
        lineHeight: 1.5,
      },
      h6: {
        fontSize: "1rem",
        fontWeight: 500,
        lineHeight: 1.6,
      },
      subtitle1: {
        fontSize: "1rem",
        fontWeight: 400,
        lineHeight: 1.75,
      },
      subtitle2: {
        fontSize: "0.875rem",
        fontWeight: 500,
        lineHeight: 1.57,
      },
      body1: {
        fontSize: "1rem",
        fontWeight: 400,
        lineHeight: 1.5,
      },
      body2: {
        fontSize: "0.875rem",
        fontWeight: 400,
        lineHeight: 1.43,
      },
      button: {
        fontSize: "0.875rem",
        fontWeight: 500,
        lineHeight: 1.75,
        textTransform: "none",
      },
    },
    shape: {
      borderRadius: 8,
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: "none",
            fontWeight: 500,
            borderRadius: 8,
            padding: "8px 16px",
            "@media (max-width: 600px)": {
              padding: "6px 12px",
              fontSize: "0.75rem",
            },
          },
          sizeSmall: {
            "@media (max-width: 600px)": {
              padding: "4px 8px",
              fontSize: "0.7rem",
              minWidth: "unset",
            },
          },
          contained: {
            boxShadow: "none",
            "&:hover": {
              boxShadow: "0px 2px 4px rgba(0,0,0,0.1)",
            },
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            boxShadow:
              mode === "dark"
                ? "0px 2px 8px rgba(0,0,0,0.3)"
                : "0px 2px 8px rgba(0,0,0,0.08)",
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            borderRadius: 8,
          },
          elevation1: {
            boxShadow:
              mode === "dark"
                ? "0px 2px 4px rgba(0,0,0,0.3)"
                : "0px 2px 4px rgba(0,0,0,0.08)",
          },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            "& .MuiOutlinedInput-root": {
              borderRadius: 8,
            },
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            boxShadow:
              mode === "dark"
                ? "0px 1px 3px rgba(0,0,0,0.3)"
                : "0px 1px 3px rgba(0,0,0,0.12)",
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            borderRight:
              mode === "dark"
                ? "1px solid rgba(255, 255, 255, 0.12)"
                : "1px solid rgba(0, 0, 0, 0.12)",
            boxShadow: "none",
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            padding: "8px 16px",
            borderBottom:
              mode === "dark"
                ? "1px solid rgba(255, 255, 255, 0.12)"
                : "1px solid rgba(0, 0, 0, 0.12)",
            "@media (max-width: 600px)": {
              padding: "4px 8px",
              fontSize: "0.7rem",
            },
          },
          head: {
            fontWeight: 600,
            "@media (max-width: 600px)": {
              fontSize: "0.65rem",
              fontWeight: 700,
            },
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            "&:hover": {
              backgroundColor:
                mode === "dark"
                  ? "rgba(255, 255, 255, 0.08)"
                  : "rgba(0, 0, 0, 0.04)",
            },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            fontWeight: 500,
            height: 24,
            fontSize: "0.75rem",
            "@media (max-width: 600px)": {
              height: 18,
              fontSize: "0.6rem",
            },
          },
          sizeSmall: {
            "@media (max-width: 600px)": {
              height: 16,
              fontSize: "0.55rem",
            },
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            "&:hover": {
              backgroundColor:
                mode === "dark"
                  ? "rgba(255, 255, 255, 0.08)"
                  : "rgba(0, 0, 0, 0.04)",
            },
          },
          sizeSmall: {
            padding: "4px",
          },
        },
      },
      MuiDialog: {
        defaultProps: {
          disableScrollLock: true,
        },
        styleOverrides: {
          paper: {
            borderRadius: 12,
          },
        },
      },
      MuiModal: {
        defaultProps: {
          disableScrollLock: true,
        },
      },
      MuiPopover: {
        defaultProps: {
          disableScrollLock: true,
        },
      },
      MuiMenu: {
        defaultProps: {
          disableScrollLock: true,
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: 8,
          },
        },
      },
    },
  });
}

// Export palettes for reference
export { lightPalette, darkPalette };

/** Trade-scoped theme: recolor palette.primary AND the two hardcoded
 *  #1976d2 component styles (MuiChip.filled.bg, MuiIconButton.root.color)
 *  which do NOT follow palette.primary. Caller memoizes and wraps ONLY the
 *  scoped subtree — Civil renders with no wrapper (byte-for-byte). */
export function createTradeTheme(base: Theme, tc: TradeColor): Theme {
  return createTheme(base, {
    palette: { primary: { main: tc.main, light: tc.light, dark: tc.dark, contrastText: tc.contrastText } },
    components: {
      MuiChip: { styleOverrides: { filled: { backgroundColor: tc.main, color: tc.contrastText } } },
      MuiIconButton: { styleOverrides: { root: { color: tc.main } } },
    },
  });
}

export default theme;
