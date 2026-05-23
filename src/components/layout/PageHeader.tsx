'use client'

import { Box, Typography, IconButton, Tooltip } from '@mui/material'
import type { TypographyProps } from '@mui/material'
import { ArrowBack } from '@mui/icons-material'
import { useRouter } from 'next/navigation'

interface PageHeaderProps {
  title: string
  subtitle?: string
  titleChip?: React.ReactNode  // Chip/badge displayed next to the title
  titleVariant?: TypographyProps['variant']
  showBack?: boolean
  actions?: React.ReactNode
}

export default function PageHeader({
  title,
  subtitle,
  titleChip,
  titleVariant,
  showBack = true,
  actions,
}: PageHeaderProps) {
  const router = useRouter()

  const handleBack = () => {
    router.back()
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: { xs: 0.5, sm: 1 },
        mb: { xs: 1, sm: 2 },
        flexWrap: 'nowrap',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1 } }}>
        {showBack && (
          <Tooltip title="Go back">
            <IconButton
              onClick={handleBack}
              size="small"
              sx={{
                mr: { xs: 0.5, sm: 1 },
                bgcolor: 'action.hover',
                '&:hover': { bgcolor: 'action.selected' },
                padding: { xs: 0.5, sm: 1 },
              }}
            >
              <ArrowBack sx={{ fontSize: { xs: 18, sm: 24 } }} />
            </IconButton>
          </Tooltip>
        )}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography
              variant={titleVariant ?? "h6"}
              fontWeight={600}
              sx={{ fontSize: { xs: '1rem', sm: '1.25rem', md: '1.5rem' } }}
            >
              {title}
            </Typography>
            {titleChip}
          </Box>
          {subtitle && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
            >
              {subtitle}
            </Typography>
          )}
        </Box>
      </Box>
      {actions && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1 }, flexWrap: 'wrap' }}>
          {actions}
        </Box>
      )}
    </Box>
  )
}
