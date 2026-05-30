'use client'

import { useState, lazy, Suspense, useRef, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Box,
  Typography,
  Paper,
  Alert,
  Tabs,
  Tab,
  Snackbar,
  CircularProgress,
} from '@mui/material'
import {
  Inventory as BatchesIcon,
  AccountBalance as SettlementIcon,
  History as HistoryIcon,
} from '@mui/icons-material'
import PageHeader from '@/components/layout/PageHeader'
import Breadcrumbs from '@/components/layout/Breadcrumbs'
import MaterialWorkflowBar from '@/components/materials/MaterialWorkflowBar'
import { useSite } from '@/contexts/SiteContext'
import { useAuth } from '@/contexts/AuthContext'
import { hasEditPermission } from '@/lib/permissions'
import { useSiteGroupMembership, useDeleteGroupStockTransaction } from '@/hooks/queries/useSiteGroups'
import {
  useInterSiteSettlements,
  useSiteSettlementSummary,
  useInterSiteBalances,
  useGenerateSettlement,
  useDeleteSettlement,
  useGroupStockTransactions,
  useCancelCompletedSettlement,
  useCancelPendingSettlement,
  useDeleteUnsettledUsage,
} from '@/hooks/queries/useInterSiteSettlements'
import { useDeleteBatchCascade } from '@/hooks/queries/useMaterialPurchases'
import { useBatchesWithUsage, useCompleteBatch, useDeleteBatchUsage } from '@/hooks/queries/useBatchUsage'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import SettlementSummaryCards from '@/components/materials/SettlementSummaryCards'
import SettlementLedger from '@/components/materials/SettlementLedger'
import type { InterSiteSettlementWithDetails, InterSiteBalance, GroupStockBatch } from '@/types/material.types'
import type { GroupStockTransaction } from '@/hooks/queries/useInterSiteSettlements'

// Lazy-load heavy tab content and dialog components
const StockBatchesTab = lazy(() => import('@/components/materials/StockBatchesTab'))
const SettlementsTab = lazy(() => import('@/components/materials/SettlementsTab'))
const BatchUsageHistoryTab = lazy(() => import('@/components/materials/BatchUsageHistoryTab'))
const NetSettlementDialog = lazy(() => import('@/components/materials/NetSettlementDialog'))
const ConvertToOwnSiteDialog = lazy(() => import('@/components/materials/ConvertToOwnSiteDialog'))
const GroupStockTransactionDrawer = lazy(() => import('@/components/materials/GroupStockTransactionDrawer'))
const EditGroupStockTransactionDialog = lazy(() => import('@/components/materials/EditGroupStockTransactionDialog'))
const InitiateBatchSettlementDialog = lazy(() => import('@/components/materials/InitiateBatchSettlementDialog'))
const RecordInterSitePaymentDialog = lazy(() => import('@/components/materials/RecordInterSitePaymentDialog'))
const BatchCompletionDialog = lazy(() => import('@/components/materials/BatchCompletionDialog'))
const GroupStockUsageDialog = lazy(() => import('@/components/materials/GroupStockUsageDialog'))

function TabLoader() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
      <CircularProgress size={32} />
    </Box>
  )
}

export default function InterSiteSettlementPage() {
  const { selectedSite } = useSite()
  const [tabValue, setTabValue] = useState(0)

  // Dialog states for batch management
  const [convertDialogOpen, setConvertDialogOpen] = useState(false)
  const [batchCompletionOpen, setBatchCompletionOpen] = useState(false)
  const [selectedBatch, setSelectedBatch] = useState<GroupStockBatch | null>(null)

  // Transaction action states
  const [viewTransaction, setViewTransaction] = useState<GroupStockTransaction | null>(null)
  const [editTransaction, setEditTransaction] = useState<GroupStockTransaction | null>(null)
  const [deleteTransaction, setDeleteTransaction] = useState<GroupStockTransaction | null>(null)
  const [viewDrawerOpen, setViewDrawerOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  // Settlement dialog states
  const [settlementDialogOpen, setSettlementDialogOpen] = useState(false)
  const [settlementData, setSettlementData] = useState<{
    batchRefCode: string
    debtorSiteId: string
    debtorSiteName: string
    creditorSiteId: string
    creditorSiteName: string
    amount: number
    settlementId?: string
  } | null>(null)

  // Settlement delete states
  const [deleteSettlementId, setDeleteSettlementId] = useState<string | null>(null)
  const [deleteSettlementConfirmOpen, setDeleteSettlementConfirmOpen] = useState(false)

  // Cancel settlement states
  const [cancelSettlementId, setCancelSettlementId] = useState<string | null>(null)
  const [cancelSettlementType, setCancelSettlementType] = useState<'completed' | 'pending' | null>(null)
  const [cancelSettlementConfirmOpen, setCancelSettlementConfirmOpen] = useState(false)

  // Delete unsettled balance states
  const [deleteUnsettledBalance, setDeleteUnsettledBalance] = useState<InterSiteBalance | null>(null)
  const [deleteUnsettledConfirmOpen, setDeleteUnsettledConfirmOpen] = useState(false)

  // Group stock usage dialog states
  const [groupUsageDialogOpen, setGroupUsageDialogOpen] = useState(false)
  const [preSelectedMaterialId, setPreSelectedMaterialId] = useState<string | null>(null)

  // Net settlement dialog states
  const [netSettleDialogOpen, setNetSettleDialogOpen] = useState(false)
  const [netSettlePair, setNetSettlePair] = useState<{ balanceA: InterSiteBalance; balanceB: InterSiteBalance } | null>(null)

  // Delete batch usage states
  const [deleteUsageData, setDeleteUsageData] = useState<{ batchRefCode: string; siteId: string; siteName: string; recordIds: string[] } | null>(null)
  const [deleteUsageConfirmOpen, setDeleteUsageConfirmOpen] = useState(false)

  // Snackbar for error messages
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'error' | 'warning' | 'success' | 'info' }>({ open: false, message: '', severity: 'error' })

  // Deep-link: read ?code=SET-xxx param
  const searchParams = useSearchParams()
  const codeParam = searchParams.get('code')
  const hasProcessedCode = useRef(false)

  // Deep-link: read ?batch=<refCode> param (from the Materials Hub "Settle
  // this batch" shortcut) — auto-opens the per-batch settle dialog.
  const batchParam = searchParams.get('batch')
  const hasProcessedBatch = useRef(false)

  // Track which tabs have been visited to avoid unmounting fetched data
  const visitedTabs = useRef(new Set<number>([0]))
  if (!visitedTabs.current.has(tabValue)) {
    visitedTabs.current.add(tabValue)
  }

  // Data hooks — always-on (needed for summary + ledger which are always visible)
  const { data: groupMembership, isLoading: membershipLoading } = useSiteGroupMembership(
    selectedSite?.id
  )
  const { data: summary, isLoading: summaryLoading } = useSiteSettlementSummary(
    selectedSite?.id
  )
  const { data: balances = [], isLoading: balancesLoading } = useInterSiteBalances(
    groupMembership?.groupId
  )

  // Tab-conditional queries — only fetch when the tab has been visited (or when deep-linking to a settlement)
  const tab0Active = visitedTabs.current.has(0)
  const tab1Active = visitedTabs.current.has(1)

  const { data: settlements = [], isLoading: settlementsLoading } = useInterSiteSettlements(
    tab1Active || !!codeParam ? selectedSite?.id : undefined
  )

  // Deep-link: auto-switch to Settlements tab and highlight when ?code=SET-xxx is present
  useEffect(() => {
    if (!codeParam || hasProcessedCode.current) return
    if (settlementsLoading || settlements.length === 0) return
    const match = settlements.find(
      (s) => s.settlement_code?.toLowerCase() === codeParam.toLowerCase()
    )
    if (match) {
      hasProcessedCode.current = true
      setTabValue(1)
    }
  }, [codeParam, settlementsLoading, settlements])

  // Transactions only needed for list view in StockBatchesTab
  const { data: transactions = [], isLoading: transactionsLoading } = useGroupStockTransactions(
    tab0Active ? groupMembership?.groupId : undefined,
    { limit: 100 }
  )
  const { data: batchesWithUsage = [], isLoading: batchesLoading } = useBatchesWithUsage(
    tab0Active || !!batchParam ? groupMembership?.groupId : undefined
  )

  // Mutation hooks
  const generateSettlement = useGenerateSettlement()
  const deleteSettlement = useDeleteSettlement()
  const deleteTransactionMutation = useDeleteGroupStockTransaction()
  const deleteBatchMutation = useDeleteBatchCascade()
  const completeBatchMutation = useCompleteBatch()
  const cancelCompletedSettlement = useCancelCompletedSettlement()
  const cancelPendingSettlement = useCancelPendingSettlement()
  const deleteUnsettledUsage = useDeleteUnsettledUsage()
  const deleteBatchUsage = useDeleteBatchUsage()

  // Auth and permissions
  const { userProfile } = useAuth()
  const canEdit = hasEditPermission(userProfile?.role)

  // Per-tab loading: only block tab content on its own data
  const tab0Loading = membershipLoading || transactionsLoading || batchesLoading
  const tab1Loading = membershipLoading || balancesLoading || settlementsLoading

  // Filter settlements for the ledger
  const pendingSettlements = settlements.filter(
    (s) => s.status === 'pending' || s.status === 'approved'
  )

  // --- Handler functions ---

  const handleConvertBatch = (batch: GroupStockBatch) => {
    setSelectedBatch(batch)
    setConvertDialogOpen(true)
  }

  const handleCompleteBatch = (batch: GroupStockBatch) => {
    setSelectedBatch(batch)
    setBatchCompletionOpen(true)
  }

  const handleConfirmBatchCompletion = async (batchRefCode: string, allocations: any[]) => {
    await completeBatchMutation.mutateAsync({
      batchRefCode,
      allocations,
    })
  }

  const handleSettleUsage = (
    batchRefCode: string,
    creditorSiteId: string,
    creditorSiteName: string,
    debtorSiteId: string,
    debtorSiteName: string,
    amount: number
  ) => {
    setSettlementData({
      batchRefCode,
      debtorSiteId,
      debtorSiteName,
      creditorSiteId,
      creditorSiteName,
      amount,
    })
    setSettlementDialogOpen(true)
  }

  const handleViewTransaction = (tx: GroupStockTransaction) => {
    setViewTransaction(tx)
    setViewDrawerOpen(true)
  }

  const handleEditTransaction = (tx: GroupStockTransaction) => {
    setEditTransaction(tx)
    setEditDialogOpen(true)
  }

  const handleDeleteTransaction = (tx: GroupStockTransaction) => {
    setDeleteTransaction(tx)
    setDeleteConfirmOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!deleteTransaction || !groupMembership?.groupId) return
    try {
      const isBatchFallback = (deleteTransaction as any)._isBatchFallback
      const batchRefCode = (deleteTransaction as any)._batchRefCode || deleteTransaction.batch_ref_code

      if (isBatchFallback && batchRefCode) {
        await deleteBatchMutation.mutateAsync(batchRefCode)
      } else {
        await deleteTransactionMutation.mutateAsync({
          transactionId: deleteTransaction.id,
          groupId: groupMembership.groupId,
        })
      }
      setDeleteConfirmOpen(false)
      setDeleteTransaction(null)
    } catch (error) {
      console.error('Failed to delete:', error)
    }
  }

  const handleGenerateSettlement = async (balance: InterSiteBalance, materialIds?: string[]) => {
    if (!groupMembership?.groupId) return
    try {
      await generateSettlement.mutateAsync({
        siteGroupId: balance.site_group_id,
        fromSiteId: balance.creditor_site_id,
        toSiteId: balance.debtor_site_id,
        year: balance.year,
        weekNumber: balance.week_number,
        materialIds,
      })
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to generate settlement'
      if (errorMessage.startsWith('VENDOR_UNPAID:')) {
        setSnackbar({
          open: true,
          message: errorMessage.replace('VENDOR_UNPAID:', ''),
          severity: 'warning',
        })
      } else {
        setSnackbar({
          open: true,
          message: errorMessage,
          severity: 'error',
        })
      }
      console.error('Failed to generate settlement:', error)
    }
  }

  const handleSettlePayment = (settlement: InterSiteSettlementWithDetails) => {
    if (!settlement.from_site || !settlement.to_site) {
      console.error('Settlement missing site details')
      return
    }

    let batchRefCode = settlement.batch_ref_code
    if (!batchRefCode) {
      batchRefCode = `SETTLEMENT-${settlement.id.slice(0, 8)}`
    }

    setSettlementData({
      batchRefCode,
      debtorSiteId: settlement.to_site_id,
      debtorSiteName: settlement.to_site.name,
      creditorSiteId: settlement.from_site_id,
      creditorSiteName: settlement.from_site.name,
      amount: Number(settlement.total_amount),
      settlementId: settlement.id,
    })
    setSettlementDialogOpen(true)
  }

  const handleDeleteSettlement = async () => {
    if (!deleteSettlementId) return
    try {
      await deleteSettlement.mutateAsync(deleteSettlementId)
      setDeleteSettlementConfirmOpen(false)
      setDeleteSettlementId(null)
    } catch (error) {
      console.error('Failed to delete settlement:', error)
    }
  }

  const handleCancelSettlement = async () => {
    if (!cancelSettlementId || !cancelSettlementType) return
    try {
      if (cancelSettlementType === 'completed') {
        await cancelCompletedSettlement.mutateAsync({
          settlementId: cancelSettlementId,
          reason: 'Cancelled by user',
        })
      } else {
        await cancelPendingSettlement.mutateAsync({
          settlementId: cancelSettlementId,
          reason: 'Cancelled by user',
        })
      }
      setCancelSettlementConfirmOpen(false)
      setCancelSettlementId(null)
      setCancelSettlementType(null)
    } catch (error) {
      console.error('Failed to cancel settlement:', error)
    }
  }

  const handleDeleteUnsettledBalance = async () => {
    if (!deleteUnsettledBalance || !groupMembership?.groupId) return
    try {
      await deleteUnsettledUsage.mutateAsync({
        groupId: groupMembership.groupId,
        creditorSiteId: deleteUnsettledBalance.creditor_site_id,
        debtorSiteId: deleteUnsettledBalance.debtor_site_id,
      })
      setDeleteUnsettledConfirmOpen(false)
      setDeleteUnsettledBalance(null)
    } catch (error) {
      console.error('Failed to delete unsettled balance:', error)
    }
  }

  const handleDeleteUsage = (batchRefCode: string, siteId: string, siteName: string, recordIds: string[]) => {
    setDeleteUsageData({ batchRefCode, siteId, siteName, recordIds })
    setDeleteUsageConfirmOpen(true)
  }

  const handleConfirmDeleteUsage = async () => {
    if (!deleteUsageData) return
    try {
      // Delete each usage record
      for (const recordId of deleteUsageData.recordIds) {
        await deleteBatchUsage.mutateAsync({
          usageId: recordId,
          batchRefCode: deleteUsageData.batchRefCode,
          siteId: deleteUsageData.siteId,
        })
      }
      setDeleteUsageConfirmOpen(false)
      setDeleteUsageData(null)
    } catch (error) {
      console.error('Failed to delete usage:', error)
      setSnackbar({
        open: true,
        message: 'Failed to delete usage record. It may already be settled.',
        severity: 'error',
      })
    }
  }

  const handleRecordGroupUsage = (materialId?: string) => {
    setPreSelectedMaterialId(materialId ?? null)
    setGroupUsageDialogOpen(true)
  }

  const handleNetSettle = (balanceA: InterSiteBalance, balanceB: InterSiteBalance) => {
    setNetSettlePair({ balanceA, balanceB })
    setNetSettleDialogOpen(true)
  }

  // Deep-link: ?batch=<refCode> from the Materials Hub. Focus the Stock &
  // Batches tab and, when the batch has exactly one site still owing, open the
  // per-batch settle dialog straight away. Settling it writes to
  // inter_site_material_settlements and flips batch_usage_records, so the
  // ledger, summary cards, and Hub lifecycle all recompute.
  useEffect(() => {
    if (!batchParam || hasProcessedBatch.current) return
    if (batchesLoading || batchesWithUsage.length === 0) return
    const batch: any = batchesWithUsage.find(
      (b: any) => b.ref_code === batchParam || b.batch_code === batchParam
    )
    if (!batch) return
    hasProcessedBatch.current = true
    setTabValue(0)
    const pendingDebtors = (batch.site_allocations ?? []).filter(
      (a: any) => !a.is_payer && a.settlement_status === 'pending'
    )
    if (pendingDebtors.length === 1) {
      const d = pendingDebtors[0]
      handleSettleUsage(
        batch.ref_code,
        batch.payment_source_site_id,
        batch.paying_site?.name || batch.payment_source_site_name || 'Paying Site',
        d.site_id,
        d.site_name,
        Number(d.amount)
      )
    }
    // Multiple (or zero) pending debtors: leave the user on the focused tab to
    // pick which site to settle.
  }, [batchParam, batchesLoading, batchesWithUsage])

  // Not in a group - show message
  if (!membershipLoading && !groupMembership?.isInGroup) {
    return (
      <Box>
        <Breadcrumbs />
        <PageHeader
          title="Inter-Site Settlement"
          subtitle="Track and settle material costs between sites"
        />
        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="subtitle2" fontWeight={600}>
            Site Not in a Group
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            This feature is only available for sites that are part of a site group.
            Site groups allow multiple nearby sites to share materials and track costs between them.
          </Typography>
        </Alert>
      </Box>
    )
  }

  return (
    <Box>
      <Breadcrumbs />

      <PageHeader
        title="Inter-Site Settlement"
        subtitle={
          groupMembership?.groupName
            ? `Track and settle material costs in ${groupMembership.groupName}`
            : 'Track and settle material costs between sites'
        }
      />

      <MaterialWorkflowBar currentStep="interSite" />

      {/* Summary Cards (3 cards) */}
      <SettlementSummaryCards summary={summary} isLoading={summaryLoading} />

      {/* Settlement Ledger - "Who Owes Whom" */}
      <SettlementLedger
        balances={balances}
        pendingSettlements={pendingSettlements}
        currentSiteId={selectedSite?.id}
        isLoading={balancesLoading || settlementsLoading}
        onGenerateSettlement={handleGenerateSettlement}
        onSettlePayment={handleSettlePayment}
        onNetSettle={handleNetSettle}
        generatePending={generateSettlement.isPending}
      />

      {/* Tabs: Stock & Batches | Settlements */}
      <Paper sx={{ mb: 2 }}>
        <Tabs
          value={tabValue}
          onChange={(_, newValue) => setTabValue(newValue)}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label="Stock & Batches" icon={<BatchesIcon />} iconPosition="start" />
          <Tab label="Settlements" icon={<SettlementIcon />} iconPosition="start" />
          <Tab label="Usage History" icon={<HistoryIcon />} iconPosition="start" />
        </Tabs>

        {/* Tab 0: Stock & Batches — only mount when active */}
        {tabValue === 0 && (
          <Box sx={{ pt: 2 }}>
            <Suspense fallback={<TabLoader />}>
              <StockBatchesTab
                batches={batchesWithUsage}
                batchesWithUsage={batchesWithUsage}
                transactions={transactions}
                isLoading={tab0Loading}
                currentSiteId={selectedSite?.id}
                allSites={groupMembership?.allSites}
                groupName={groupMembership?.groupName}
                canEdit={canEdit}
                onConvertToOwnSite={handleConvertBatch}
                onCompleteBatch={handleCompleteBatch}
                onSettleUsage={handleSettleUsage}
                onViewTransaction={handleViewTransaction}
                onEditTransaction={handleEditTransaction}
                onDeleteTransaction={handleDeleteTransaction}
                onDeleteUsage={handleDeleteUsage}
                onRecordGroupUsage={handleRecordGroupUsage}
              />
            </Suspense>
          </Box>
        )}

        {/* Tab 1: Settlements — only mount when active */}
        {tabValue === 1 && (
          <Box sx={{ pt: 2 }}>
            <Suspense fallback={<TabLoader />}>
              <SettlementsTab
                balances={balances}
                settlements={settlements}
                currentSiteId={selectedSite?.id}
                isLoading={tab1Loading}
                canEdit={canEdit}
                onGenerateSettlement={handleGenerateSettlement}
                onSettlePayment={handleSettlePayment}
                onDeleteSettlement={(id) => {
                  setDeleteSettlementId(id)
                  setDeleteSettlementConfirmOpen(true)
                }}
                onCancelSettlement={(id, type) => {
                  setCancelSettlementId(id)
                  setCancelSettlementType(type)
                  setCancelSettlementConfirmOpen(true)
                }}
                onDeleteUnsettledBalance={(balance) => {
                  setDeleteUnsettledBalance(balance)
                  setDeleteUnsettledConfirmOpen(true)
                }}
                generatePending={generateSettlement.isPending}
                cancelPending={cancelCompletedSettlement.isPending || cancelPendingSettlement.isPending}
                deletePending={deleteSettlement.isPending}
                deleteUnsettledPending={deleteUnsettledUsage.isPending}
                highlightCode={codeParam}
              />
            </Suspense>
          </Box>
        )}

        {/* Tab 2: Usage History — only mount when active */}
        {tabValue === 2 && (
          <Box sx={{ pt: 2 }}>
            <Suspense fallback={<TabLoader />}>
              <BatchUsageHistoryTab
                groupId={groupMembership?.groupId}
                currentSiteId={selectedSite?.id}
                allSites={groupMembership?.allSites}
                canEdit={canEdit}
              />
            </Suspense>
          </Box>
        )}
      </Paper>

      {/* Info Box */}
      <Alert severity="info">
        <Typography variant="subtitle2" fontWeight={600}>
          How Inter-Site Settlement Works
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.5 }}>
          When sites share materials:
        </Typography>
        <Box component="ul" sx={{ mt: 0.5, pl: 2, mb: 0 }}>
          <li>
            <Typography variant="body2">
              Site A pays for materials (e.g., 1000 bricks at Rs.10 = Rs.10,000)
            </Typography>
          </li>
          <li>
            <Typography variant="body2">
              Site B uses 300 bricks from shared stock
            </Typography>
          </li>
          <li>
            <Typography variant="body2">
              Weekly settlement shows Site B owes Site A Rs.3,000
            </Typography>
          </li>
        </Box>
      </Alert>

      {/* Dialogs — only mount when open (lazy-loaded) */}
      {convertDialogOpen && selectedSite?.id && (
        <Suspense fallback={null}>
          <ConvertToOwnSiteDialog
            open={convertDialogOpen}
            onClose={() => {
              setConvertDialogOpen(false)
              setSelectedBatch(null)
            }}
            batch={selectedBatch}
            siteId={selectedSite.id}
          />
        </Suspense>
      )}

      {viewDrawerOpen && (
        <Suspense fallback={null}>
          <GroupStockTransactionDrawer
            open={viewDrawerOpen}
            onClose={() => {
              setViewDrawerOpen(false)
              setViewTransaction(null)
            }}
            transaction={viewTransaction}
          />
        </Suspense>
      )}

      {editDialogOpen && (
        <Suspense fallback={null}>
          <EditGroupStockTransactionDialog
            open={editDialogOpen}
            onClose={() => {
              setEditDialogOpen(false)
              setEditTransaction(null)
            }}
            transaction={editTransaction}
            groupId={groupMembership?.groupId}
          />
        </Suspense>
      )}

      <ConfirmDialog
        open={deleteConfirmOpen}
        title={(deleteTransaction as any)?._isBatchFallback ? "Delete Purchase Batch" : "Delete Transaction"}
        message={(deleteTransaction as any)?._isBatchFallback
          ? "Are you sure you want to delete this purchase batch? This will also delete all related usage records, settlements, and transactions."
          : "Are you sure you want to delete this transaction? This will also update the inventory balance."
        }
        confirmText="Delete"
        confirmColor="error"
        isLoading={deleteTransactionMutation.isPending || deleteBatchMutation.isPending}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setDeleteConfirmOpen(false)
          setDeleteTransaction(null)
        }}
      />

      <ConfirmDialog
        open={deleteSettlementConfirmOpen}
        title="Delete Settlement"
        message="Are you sure you want to delete this settlement record? The balance will move back to 'Unsettled Balances' and you can regenerate the settlement later."
        confirmText="Delete"
        confirmColor="error"
        isLoading={deleteSettlement.isPending}
        onConfirm={handleDeleteSettlement}
        onCancel={() => {
          setDeleteSettlementConfirmOpen(false)
          setDeleteSettlementId(null)
        }}
      />

      <ConfirmDialog
        open={cancelSettlementConfirmOpen}
        title={cancelSettlementType === 'completed' ? 'Cancel Completed Settlement' : 'Cancel Pending Settlement'}
        message={
          cancelSettlementType === 'completed'
            ? 'Are you sure you want to cancel this completed settlement? It will be moved back to Pending status and payment records will be deleted.'
            : 'Are you sure you want to cancel this pending settlement? The usage records will be returned to Unsettled Balances.'
        }
        confirmText="Cancel Settlement"
        confirmColor="warning"
        isLoading={cancelCompletedSettlement.isPending || cancelPendingSettlement.isPending}
        onConfirm={handleCancelSettlement}
        onCancel={() => {
          setCancelSettlementConfirmOpen(false)
          setCancelSettlementId(null)
          setCancelSettlementType(null)
        }}
      />

      <ConfirmDialog
        open={deleteUnsettledConfirmOpen}
        title="Delete Usage Records"
        message={`Are you sure you want to permanently delete the usage records between ${deleteUnsettledBalance?.creditor_site_name || 'Creditor'} and ${deleteUnsettledBalance?.debtor_site_name || 'Debtor'}? This will restore the inventory and remove all usage history. This action cannot be undone.`}
        confirmText="Delete Permanently"
        confirmColor="error"
        isLoading={deleteUnsettledUsage.isPending}
        onConfirm={handleDeleteUnsettledBalance}
        onCancel={() => {
          setDeleteUnsettledConfirmOpen(false)
          setDeleteUnsettledBalance(null)
        }}
      />

      <ConfirmDialog
        open={deleteUsageConfirmOpen}
        title="Delete Usage Record"
        message={`Are you sure you want to delete the usage record for ${deleteUsageData?.siteName || 'this site'} from batch ${deleteUsageData?.batchRefCode || ''}? This will restore the stock back to the batch.`}
        confirmText="Delete"
        confirmColor="error"
        isLoading={deleteBatchUsage.isPending}
        onConfirm={handleConfirmDeleteUsage}
        onCancel={() => {
          setDeleteUsageConfirmOpen(false)
          setDeleteUsageData(null)
        }}
      />

      {settlementDialogOpen && settlementData && !settlementData.settlementId && (
        <Suspense fallback={null}>
          <InitiateBatchSettlementDialog
            open={settlementDialogOpen}
            onClose={() => {
              setSettlementDialogOpen(false)
              setSettlementData(null)
            }}
            batchRefCode={settlementData.batchRefCode}
            debtorSiteId={settlementData.debtorSiteId}
            debtorSiteName={settlementData.debtorSiteName}
            creditorSiteId={settlementData.creditorSiteId}
            creditorSiteName={settlementData.creditorSiteName}
            amount={settlementData.amount}
          />
        </Suspense>
      )}

      {settlementDialogOpen && settlementData && settlementData.settlementId && (
        <Suspense fallback={null}>
          <RecordInterSitePaymentDialog
            open={settlementDialogOpen}
            onClose={() => {
              setSettlementDialogOpen(false)
              setSettlementData(null)
            }}
            settlementId={settlementData.settlementId}
            debtorSiteId={settlementData.debtorSiteId}
            debtorSiteName={settlementData.debtorSiteName}
            creditorSiteId={settlementData.creditorSiteId}
            creditorSiteName={settlementData.creditorSiteName}
            amount={settlementData.amount}
          />
        </Suspense>
      )}

      {batchCompletionOpen && (
        <Suspense fallback={null}>
          <BatchCompletionDialog
            open={batchCompletionOpen}
            onClose={() => {
              setBatchCompletionOpen(false)
              setSelectedBatch(null)
            }}
            batch={selectedBatch}
            onComplete={handleConfirmBatchCompletion}
          />
        </Suspense>
      )}

      {groupUsageDialogOpen && selectedSite?.id && (
        <Suspense fallback={null}>
          <GroupStockUsageDialog
            open={groupUsageDialogOpen}
            onClose={() => {
              setGroupUsageDialogOpen(false)
              setPreSelectedMaterialId(null)
            }}
            siteId={selectedSite.id}
            batchesWithUsage={batchesWithUsage}
            preSelectedMaterialId={preSelectedMaterialId}
          />
        </Suspense>
      )}

      {netSettleDialogOpen && netSettlePair && groupMembership?.groupId && (
        <Suspense fallback={null}>
          <NetSettlementDialog
            open={netSettleDialogOpen}
            onClose={() => {
              setNetSettleDialogOpen(false)
              setNetSettlePair(null)
            }}
            balanceA={netSettlePair.balanceA}
            balanceB={netSettlePair.balanceB}
            groupId={groupMembership.groupId}
            onSuccess={() => {
              setNetSettleDialogOpen(false)
              setNetSettlePair(null)
            }}
            debtorSiteId={
              netSettlePair.balanceA.total_amount_owed > netSettlePair.balanceB.total_amount_owed
                ? netSettlePair.balanceA.debtor_site_id
                : netSettlePair.balanceB.debtor_site_id
            }
          />
        </Suspense>
      )}

      {/* Error/Warning Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={8000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}
