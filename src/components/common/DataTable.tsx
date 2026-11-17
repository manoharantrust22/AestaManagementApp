"use client";

import { useMemo } from "react";
import {
  MaterialReactTable,
  type MRT_ColumnDef,
  type MRT_RowData,
  type MRT_TableOptions,
} from "material-react-table";
import { Box, Chip, useTheme } from "@mui/material";
import { useIsMobile, useIsTablet } from "@/hooks/useIsMobile";

// Default table configuration - centralized for entire app
export const tableDefaults = {
  // Density settings
  enableDensityToggle: false,
  density: "compact" as const,

  // Column features
  enableColumnActions: true,
  enableColumnFilters: true,
  enableSorting: true,
  enableColumnResizing: true,
  enableColumnOrdering: true, // Allow column rearrangement
  enableColumnPinning: true, // Allow freezing columns

  // Row features
  enableRowSelection: false,
  enableRowNumbers: false,
  enableRowVirtualization: true, // Virtual scrolling for large datasets (500+ rows)

  // Global filter/search
  enableGlobalFilter: true,
  enableGlobalFilterModes: false,
  globalFilterFn: "contains" as const,
  positionGlobalFilter: "right" as const,

  // Toolbar features
  enableFullScreenToggle: true,
  enableHiding: true,
  enableFilters: true,

  // Pagination
  enablePagination: true,
  paginationDisplayMode: "pages" as const,

  // Layout
  layoutMode: "semantic" as const,
  enableStickyHeader: true,

  // Initial state
  initialState: {
    density: "compact" as const,
    showColumnFilters: true,  // Show column filters by default for better filtering UX
    showGlobalFilter: true,
    pagination: {
      pageSize: 100,
      pageIndex: 0,
    },
    columnPinning: {
      right: ["mrt-row-actions"], // Pin actions column to the right by default
    },
  },

  // Pagination options
  muiPaginationProps: {
    rowsPerPageOptions: [10, 50, 100, 200],
    showFirstButton: true,
    showLastButton: true,
  },
};

// Pagination state type for server-side pagination
export interface PaginationState {
  pageIndex: number;
  pageSize: number;
}

// Props interface for DataTable component
interface DataTableProps<TData extends MRT_RowData>
  extends Omit<Partial<MRT_TableOptions<TData>>, 'onPaginationChange'> {
  columns: MRT_ColumnDef<TData>[];
  data: TData[];
  isLoading?: boolean;
  // Override default pagination
  pageSize?: number;
  // Enable/disable features
  enableActions?: boolean;
  enableSelection?: boolean;
  // Custom styling
  maxHeight?: string | number;
  minHeight?: string | number;
  // Mobile-specific props
  pinnedColumns?: {
    left?: string[];
    right?: string[];
  };
  // Ultra-compact mode for mobile
  compactMode?: boolean;
  // Columns to hide on mobile (by accessorKey)
  mobileHiddenColumns?: string[];
  // Show total record count in toolbar
  showRecordCount?: boolean;
  // Make the table fill its flex parent's height — Paper becomes a flex column
  // and only the table body scrolls. Parent must be display:flex column with
  // a constrained height for this to work.
  fillParent?: boolean;
  // Server-side pagination props
  manualPagination?: boolean;
  rowCount?: number;
  pagination?: PaginationState;
  onPaginationChange?: (pagination: PaginationState) => void;
}

export default function DataTable<TData extends MRT_RowData>({
  columns,
  data,
  isLoading = false,
  pageSize,
  enableActions = false,
  enableSelection = false,
  maxHeight,
  minHeight,
  pinnedColumns,
  compactMode = true, // Default to compact on mobile
  mobileHiddenColumns = [],
  showRecordCount = true, // Show record count by default
  fillParent = false,
  // Server-side pagination props
  manualPagination = false,
  rowCount,
  pagination: controlledPagination,
  onPaginationChange,
  // Destructure initialState separately to merge properly
  initialState: propsInitialState,
  ...otherProps
}: DataTableProps<TData>) {
  const theme = useTheme();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const useCompact = compactMode && isMobile;

  // Build column visibility for mobile
  const mobileColumnVisibility = useMemo(() => {
    if (!isMobile || mobileHiddenColumns.length === 0) return {};
    return Object.fromEntries(
      mobileHiddenColumns.map((col) => [col, false])
    );
  }, [isMobile, mobileHiddenColumns]);

  // Merge initial state with custom pagination, pinned columns, and column visibility
  // IMPORTANT: We explicitly merge propsInitialState to ensure pagination settings are preserved
  const initialState = useMemo(
    () => ({
      ...tableDefaults.initialState,
      // Apply custom initial state first (like sorting)
      ...propsInitialState,
      // Always ensure pagination is set correctly (pageSize prop or default 100)
      pagination: {
        pageSize: isMobile ? Math.min(pageSize || 100, 100) : (pageSize || 100),
        pageIndex: 0,
      },
      // Apply pinned columns - auto-pin first column on mobile if not specified
      columnPinning: {
        left: pinnedColumns?.left || [],
        right: pinnedColumns?.right || ['mrt-row-actions'],
      },
      // Hide specified columns on mobile
      columnVisibility: {
        ...mobileColumnVisibility,
        ...(propsInitialState?.columnVisibility || {}),
      },
    }),
    [pageSize, pinnedColumns, mobileColumnVisibility, isMobile, propsInitialState]
  );

  // Table container styles with ultra-compact mobile optimization
  const muiTableContainerProps = useMemo(
    () => ({
      sx: {
        // fillParent: scroll container takes whatever flex height is available;
        // otherwise fall back to the legacy viewport-based maxHeight calc.
        ...(fillParent
          ? { flex: 1, minHeight: 0, maxHeight: 'none' }
          : {
              maxHeight:
                maxHeight ||
                (useCompact
                  ? 'calc(100vh - 260px)'
                  : isTablet
                  ? 'calc(100vh - 300px)'
                  : 'calc(100vh - 280px)'),
              minHeight: minHeight || (useCompact ? 250 : 350),
            }),
        overflowX: 'auto',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        scrollbarGutter: 'stable',
        // Stylish thin scrollbar — applied in all modes for consistency.
        '&::-webkit-scrollbar': {
          height: useCompact ? 6 : 8,
          width: useCompact ? 6 : 8,
        },
        '&::-webkit-scrollbar-track': {
          backgroundColor: 'transparent',
        },
        '&::-webkit-scrollbar-thumb': {
          backgroundColor:
            theme.palette.mode === 'dark'
              ? 'rgba(255,255,255,0.18)'
              : 'rgba(0,0,0,0.22)',
          borderRadius: 8,
          border: `2px solid transparent`,
          backgroundClip: 'content-box',
          '&:hover': {
            backgroundColor:
              theme.palette.mode === 'dark'
                ? 'rgba(255,255,255,0.32)'
                : 'rgba(0,0,0,0.36)',
          },
        },
        '&::-webkit-scrollbar-corner': { background: 'transparent' },
        // Firefox
        scrollbarWidth: 'thin',
        scrollbarColor:
          theme.palette.mode === 'dark'
            ? 'rgba(255,255,255,0.18) transparent'
            : 'rgba(0,0,0,0.22) transparent',
        ...((otherProps.muiTableContainerProps as any)?.sx || {}),
      },
    }),
    [maxHeight, minHeight, useCompact, isTablet, fillParent, theme.palette, otherProps.muiTableContainerProps]
  );

  // Paper styles for the table wrapper
  const muiTablePaperProps = useMemo(
    () => ({
      elevation: 0,
      sx: {
        borderRadius: useCompact ? 1 : 2,
        border: `1px solid ${theme.palette.divider}`,
        overflow: 'hidden',
        // fillParent: Paper becomes a flex column so toolbar/body/pagination
        // share the parent's height with no nested scrollbar.
        ...(fillParent
          ? {
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              flex: 1,
              minHeight: 0,
            }
          : {}),
        ...((otherProps.muiTablePaperProps as any)?.sx || {}),
      },
    }),
    [theme.palette.divider, useCompact, fillParent, otherProps.muiTablePaperProps]
  );

  // Table head cell styles - ultra-compact on mobile
  const muiTableHeadCellProps = useMemo(
    () => ({
      sx: {
        fontWeight: 700,
        backgroundColor: theme.palette.mode === 'dark'
          ? theme.palette.background.paper  // Use paper color for better contrast in dark mode
          : theme.palette.background.default,
        color: theme.palette.text.primary,
        fontSize: useCompact ? "0.65rem" : isTablet ? "0.75rem" : "0.8rem",
        py: useCompact ? 0.5 : isTablet ? 0.75 : 1,
        px: useCompact ? 0.75 : isTablet ? 1 : 1.5,
        whiteSpace: 'nowrap',
        lineHeight: 1.2,
        '& .Mui-TableHeadCell-Content': {
          justifyContent: 'flex-start',
        },
        '& .Mui-TableHeadCell-Content-Labels': {
          gap: 0.25,
        },
        '& .Mui-TableHeadCell-Content-Wrapper': {
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        },
        '& .MuiSvgIcon-root': {
          color: theme.palette.text.secondary, // Fix sort/filter icons in header
        },
        ...((otherProps.muiTableHeadCellProps as any)?.sx || {}),
      },
    }),
    [theme.palette.mode, theme.palette.background.paper, theme.palette.background.default, theme.palette.text.primary, theme.palette.text.secondary, useCompact, isTablet, otherProps.muiTableHeadCellProps]
  );

  // Table body cell styles - ultra-compact on mobile
  const muiTableBodyCellProps = useMemo(
    () => ({
      sx: {
        fontSize: useCompact ? "0.7rem" : isTablet ? "0.75rem" : "0.8rem",
        py: useCompact ? 0.25 : isTablet ? 0.5 : 0.75,
        px: useCompact ? 0.75 : isTablet ? 1 : 1.5,
        lineHeight: 1.3,
        // MRT draws pinned cells at 0.97 opacity, so chips scrolled under a
        // pinned column (e.g. Status under Actions) show through faintly.
        '&[data-pinned="true"]': {
          opacity: 1,
        },
        '& .MuiChip-root': {
          height: useCompact ? 18 : 22,
          fontSize: useCompact ? '0.6rem' : '0.7rem',
          '& .MuiChip-label': {
            px: useCompact ? 0.5 : 0.75,
          },
        },
        '& .MuiIconButton-root': {
          padding: useCompact ? 0.25 : 0.5,
          '& .MuiSvgIcon-root': {
            fontSize: useCompact ? '1rem' : '1.15rem',
          },
        },
        ...((otherProps.muiTableBodyCellProps as any)?.sx || {}),
      },
    }),
    [useCompact, isTablet, otherProps.muiTableBodyCellProps]
  );

  // Top toolbar styles - compact on mobile
  const muiTopToolbarProps = useMemo(
    () => ({
      sx: {
        backgroundColor: theme.palette.background.paper,
        minHeight: useCompact ? 40 : 48,
        px: useCompact ? 0.5 : 1,
        py: useCompact ? 0.25 : 0.5,
        // Vertically center every direct toolbar slot (search, column toggle,
        // fullscreen, custom actions). MRT lays items out as flex children;
        // alignItems on the toolbar keeps them on a shared baseline.
        display: 'flex',
        alignItems: 'center',
        '& > *': {
          display: 'flex',
          alignItems: 'center',
        },
        '& .MuiBox-root': {
          gap: useCompact ? 0.25 : 0.5,
        },
        '& .MuiIconButton-root': {
          padding: useCompact ? 0.5 : 1,
          color: theme.palette.text.primary, // Fix dark mode icon color
        },
        '& .MuiSvgIcon-root': {
          color: theme.palette.text.primary, // Fix fullscreen and other icons
        },
        '& .MuiInputBase-root': {
          fontSize: useCompact ? '0.75rem' : '0.875rem',
          height: useCompact ? 32 : 40,
        },
        ...((otherProps.muiTopToolbarProps as any)?.sx || {}),
      },
    }),
    [theme.palette.background.paper, theme.palette.text.primary, useCompact, otherProps.muiTopToolbarProps]
  );

  // Bottom toolbar styles - compact on mobile
  const muiBottomToolbarProps = useMemo(
    () => ({
      sx: {
        backgroundColor: theme.palette.background.paper,
        minHeight: useCompact ? 36 : 48,
        px: useCompact ? 0.5 : 1,
        '& .MuiTablePagination-root': {
          overflow: 'hidden',
        },
        '& .MuiTablePagination-toolbar': {
          minHeight: useCompact ? 36 : 48,
          px: useCompact ? 0 : 1,
        },
        '& .MuiTablePagination-selectLabel': {
          display: useCompact ? 'none' : 'block',
          fontSize: '0.75rem',
        },
        '& .MuiTablePagination-displayedRows': {
          fontSize: useCompact ? '0.65rem' : '0.75rem',
          margin: 0,
        },
        '& .MuiTablePagination-select': {
          fontSize: useCompact ? '0.7rem' : '0.8rem',
        },
        '& .MuiTablePagination-actions': {
          ml: useCompact ? 0 : 1,
          '& .MuiIconButton-root': {
            padding: useCompact ? 0.25 : 0.5,
          },
        },
        ...((otherProps.muiBottomToolbarProps as any)?.sx || {}),
      },
    }),
    [theme.palette.background.paper, useCompact, otherProps.muiBottomToolbarProps]
  );

  // Search box styles - compact
  const muiSearchTextFieldProps = useMemo(
    () => ({
      size: 'small' as const,
      variant: 'outlined' as const,
      sx: {
        '& .MuiInputBase-root': {
          fontSize: useCompact ? '0.75rem' : '0.875rem',
          py: 0,
        },
        '& .MuiInputBase-input': {
          py: useCompact ? 0.5 : 0.75,
          px: useCompact ? 1 : 1.5,
        },
        minWidth: useCompact ? 120 : 180,
        maxWidth: useCompact ? 160 : 250,
      },
    }),
    [useCompact]
  );

  // Table row styles
  const muiTableBodyRowProps = useMemo(
    () => ({
      sx: {
        '&:hover': {
          backgroundColor: theme.palette.action.hover,
        },
      },
    }),
    [theme.palette.action.hover]
  );

  // Pagination props - simplified for mobile
  const muiPaginationProps = useMemo(
    () => ({
      rowsPerPageOptions: useCompact ? [25, 50, 100] : [10, 50, 100, 200],
      showFirstButton: !useCompact,
      showLastButton: !useCompact,
      size: useCompact ? 'small' as const : 'medium' as const,
    }),
    [useCompact]
  );

  const tableContent = (
    <MaterialReactTable
      columns={columns}
      data={data}
      // Spread all defaults
      {...tableDefaults}
      // State - include controlled pagination when using server-side
      state={{
        isLoading,
        ...(manualPagination && controlledPagination ? { pagination: controlledPagination } : {}),
        ...(otherProps.state || {}),
      }}
      // Server-side pagination props
      manualPagination={manualPagination}
      rowCount={rowCount}
      onPaginationChange={onPaginationChange ? (updater) => {
        const newPagination = typeof updater === 'function'
          ? updater(controlledPagination || { pageIndex: 0, pageSize: pageSize || 100 })
          : updater;
        onPaginationChange(newPagination);
      } : undefined}
      // Merged initial state
      initialState={initialState}
      // Row selection if enabled
      enableRowSelection={enableSelection}
      // Disable features on mobile for performance
      enableColumnOrdering={!useCompact}
      enableColumnResizing={!useCompact}
      enableFullScreenToggle={!useCompact}
      // Styling props
      muiTableContainerProps={muiTableContainerProps}
      muiTablePaperProps={muiTablePaperProps}
      muiTableHeadCellProps={muiTableHeadCellProps}
      muiTableBodyCellProps={muiTableBodyCellProps}
      muiTableBodyRowProps={muiTableBodyRowProps}
      muiTopToolbarProps={muiTopToolbarProps}
      muiBottomToolbarProps={muiBottomToolbarProps}
      muiSearchTextFieldProps={muiSearchTextFieldProps}
      muiPaginationProps={muiPaginationProps}
      // Show record count in footer (left side)
      renderBottomToolbarCustomActions={showRecordCount ? ({ table }) => {
        // For server-side pagination, use rowCount; otherwise use local counts
        const totalCount = manualPagination ? (rowCount || 0) : data.length;
        const filteredCount = manualPagination
          ? totalCount
          : table.getFilteredRowModel().rows.length;
        const isFiltered = !manualPagination && filteredCount !== totalCount;

        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, height: '100%' }}>
            {isFiltered ? (
              <>
                <Chip
                  label={`${filteredCount} filtered`}
                  size="small"
                  color="primary"
                  variant="filled"
                  sx={{
                    fontWeight: 600,
                    fontSize: useCompact ? '0.65rem' : '0.75rem',
                  }}
                />
                <Chip
                  label={`${totalCount} total`}
                  size="small"
                  variant="outlined"
                  sx={{
                    fontWeight: 500,
                    fontSize: useCompact ? '0.65rem' : '0.75rem',
                  }}
                />
              </>
            ) : (
              <Chip
                label={`${totalCount} records`}
                size="small"
                variant="outlined"
                sx={{
                  fontWeight: 500,
                  fontSize: useCompact ? '0.65rem' : '0.75rem',
                }}
              />
            )}
          </Box>
        );
      } : undefined}
      // Spread any additional props (allows full customization)
      {...otherProps}
    />
  );

  // Wrap in scroll indicator container for mobile
  if (useCompact) {
    return (
      <Box
        sx={{
          position: 'relative',
          '&::after': {
            content: '""',
            position: 'absolute',
            right: 0,
            top: 40, // Below toolbar
            bottom: 36, // Above pagination
            width: 12,
            background: `linear-gradient(to right, transparent, ${theme.palette.action.hover})`,
            pointerEvents: 'none',
            opacity: 0.7,
            borderRadius: '0 4px 4px 0',
          },
        }}
      >
        {tableContent}
      </Box>
    );
  }

  return tableContent;
}

// Re-export types for convenience
export type { MRT_ColumnDef, MRT_RowData, MRT_TableOptions };
