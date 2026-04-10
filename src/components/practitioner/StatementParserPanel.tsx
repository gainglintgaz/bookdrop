// src/components/practitioner/StatementParserPanel.tsx
// Inline panel that parses uploaded PDFs/CSVs and shows extracted data.
// Supports: bank, credit card, payroll, utility, mortgage, student loan.
// Runs entirely client-side — no data leaves the browser.

import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  parseBankStatementPDF,
  parseCSVStatement,
  exportTransactionsCSV,
  STATEMENT_TYPE_LABELS,
  type StatementSummary,
  type StatementType,
} from '@/lib/parse-bank-statement'
import type { RequirementWithUploads } from '@/types'
import { isDemoMode } from '@/lib/mode'
import { supabase } from '@/lib/supabase'
import {
  FileSearch,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Download,
  CreditCard,
  Building2,
  Receipt,
  Zap,
  Home,
  GraduationCap,
  FileText,
} from 'lucide-react'

// ─── TYPES ────────────────────────────────────────────────────────────────

interface ParsedRequirement {
  requirementId: string
  filename: string
  summary: StatementSummary | null
  error: string | null
  parsing: boolean
}

interface Props {
  requirements: RequirementWithUploads[]
  clientName: string
  year: number
  month: number
  /** Called when statements are parsed so parent can use for completeness/reconciliation */
  onStatementsParsed?: (summaries: StatementSummary[]) => void
}

// ─── STATEMENT TYPE ICON MAP ──────────────────────────────────────────────

function StatementIcon({ type, className }: { type: StatementType; className?: string }) {
  const props = { className: cn('h-4 w-4', className) }
  switch (type) {
    case 'bank': return <Building2 {...props} />
    case 'credit_card': return <CreditCard {...props} />
    case 'payroll': return <Receipt {...props} />
    case 'utility': return <Zap {...props} />
    case 'mortgage': return <Home {...props} />
    case 'student_loan': return <GraduationCap {...props} />
    default: return <FileText {...props} />
  }
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────

export function StatementParserPanel({ requirements, clientName, year, month, onStatementsParsed }: Props) {
  const [results, setResults] = useState<ParsedRequirement[]>([])
  const [parsingAll, setParsingAll] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // Only show for requirements that have uploaded PDFs/CSVs
  const parseable = requirements
    .filter(r => r.uploads.length > 0)
    .flatMap(r =>
      r.uploads
        .filter(u => /\.(pdf|csv|qbo)$/i.test(u.filename_original))
        .map(u => ({ requirement: r, upload: u }))
    )

  if (parseable.length === 0) return null

  const handleParseAll = async () => {
    if (isDemoMode) {
      // In demo mode, generate synthetic parsed results
      const demoResults = generateDemoParseResults(requirements)
      setResults(demoResults)
      setExpandedIds(new Set(demoResults.filter(r => r.summary).map(r => r.requirementId)))
      if (onStatementsParsed) {
        onStatementsParsed(demoResults.filter(r => r.summary).map(r => r.summary!))
      }
      return
    }

    setParsingAll(true)
    const newResults: ParsedRequirement[] = []

    for (const { requirement, upload } of parseable) {
      const entry: ParsedRequirement = {
        requirementId: requirement.id,
        filename: upload.filename_original,
        summary: null,
        error: null,
        parsing: true,
      }
      newResults.push(entry)
      setResults([...newResults])

      try {
        const { data: fileData, error: dlError } = await supabase.storage
          .from('documents')
          .download(upload.storage_path)

        if (dlError || !fileData) {
          entry.error = dlError?.message ?? 'Failed to download file'
          entry.parsing = false
          setResults([...newResults])
          continue
        }

        const file = new File([fileData], upload.filename_original, { type: fileData.type })
        const isCSV = upload.filename_original.toLowerCase().endsWith('.csv')
        const summary = isCSV ? await parseCSVStatement(file) : await parseBankStatementPDF(file)
        entry.summary = summary
        entry.parsing = false
      } catch (err) {
        entry.error = err instanceof Error ? err.message : 'Parse failed'
        entry.parsing = false
      }
      setResults([...newResults])
    }

    setParsingAll(false)
  }

  const handleParseFile = async (file: File, requirementId: string) => {
    const entry: ParsedRequirement = {
      requirementId,
      filename: file.name,
      summary: null,
      error: null,
      parsing: true,
    }

    setResults(prev => {
      const filtered = prev.filter(r => r.requirementId !== requirementId)
      return [...filtered, entry]
    })

    try {
      const summary = await parseBankStatementPDF(file)
      entry.summary = summary
      entry.parsing = false
    } catch (err) {
      entry.error = err instanceof Error ? err.message : 'Failed to parse document'
      entry.parsing = false
    }

    setResults(prev => {
      const filtered = prev.filter(r => r.requirementId !== requirementId)
      return [...filtered, entry]
    })

    // Expand the result
    setExpandedIds(prev => new Set([...prev, requirementId]))

    // Notify parent
    if (onStatementsParsed) {
      const allSummaries = results
        .filter(r => r.summary && r.requirementId !== requirementId)
        .map(r => r.summary!)
      if (entry.summary) allSummaries.push(entry.summary)
      onStatementsParsed(allSummaries)
    }
  }

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const hasParsedResults = results.some(r => r.summary)

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">
          <FileSearch className="mr-1.5 inline h-4 w-4" />
          Statement Parser
        </h3>
        <div className="flex items-center gap-2">
          {hasParsedResults && (
            <span className="text-xs text-gray-400">
              {results.filter(r => r.summary).length} of {parseable.length} parsed
            </span>
          )}
          <button
            onClick={handleParseAll}
            disabled={parsingAll}
            className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
          >
            {parsingAll ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileSearch className="h-3.5 w-3.5" />
            )}
            {parsingAll ? 'Parsing...' : isDemoMode ? 'Parse All (Demo)' : 'Parse All Uploads'}
          </button>
        </div>
      </div>

      <p className="mb-3 text-xs text-gray-400">
        Parse uploaded PDFs and CSVs to extract transactions, balances, and details.
        Auto-detects: bank, credit card, payroll, utility, mortgage, and student loan statements.
        {isDemoMode ? ' (Demo mode — showing synthetic data)' : ' All processing runs in your browser.'}
      </p>

      {/* Per-requirement file upload + parse buttons */}
      <div className="space-y-2">
        {parseable.map(({ requirement, upload }) => {
          const result = results.find(r => r.requirementId === requirement.id)
          const isExpanded = expandedIds.has(requirement.id)

          return (
            <div key={`${requirement.id}-${upload.id}`} className="rounded-lg border border-gray-200 bg-white">
              {/* Header row */}
              <div
                className="flex cursor-pointer items-center justify-between px-4 py-3"
                onClick={() => result?.summary && toggleExpand(requirement.id)}
              >
                <div className="flex items-center gap-3">
                  {result?.summary ? (
                    <button onClick={(e) => { e.stopPropagation(); toggleExpand(requirement.id) }}>
                      {isExpanded
                        ? <ChevronDown className="h-4 w-4 text-gray-400" />
                        : <ChevronRight className="h-4 w-4 text-gray-400" />
                      }
                    </button>
                  ) : (
                    <div className="w-4" />
                  )}

                  {result?.summary ? (
                    <StatementIcon type={result.summary.statementType} className="text-primary" />
                  ) : result?.parsing ? (
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                  ) : result?.error ? (
                    <AlertTriangle className="h-4 w-4 text-warning" />
                  ) : (
                    <FileText className="h-4 w-4 text-gray-300" />
                  )}

                  <div>
                    <p className="text-sm font-medium text-gray-900">{requirement.label}</p>
                    <p className="text-xs text-gray-500">
                      {upload.filename_original}
                      {result?.summary && (
                        <span className="ml-2 text-primary">
                          — {STATEMENT_TYPE_LABELS[result.summary.statementType]}
                          {result.summary.transactions.length > 0 && ` · ${result.summary.transactions.length} transactions`}
                        </span>
                      )}
                      {result?.error && (
                        <span className="ml-2 text-warning">{result.error}</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  {!isDemoMode && !result?.summary && (
                    <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
                      <FileSearch className="h-3.5 w-3.5" />
                      Parse File
                      <input
                        type="file"
                        accept=".pdf,.csv,.qbo"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) handleParseFile(f, requirement.id)
                        }}
                      />
                    </label>
                  )}
                  {result?.summary && result.summary.transactions.length > 0 && (
                    <button
                      onClick={() => exportTransactionsCSV(
                        result.summary!.transactions,
                        clientName,
                        `${year}-${String(month).padStart(2, '0')}`,
                      )}
                      className="flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      <Download className="h-3 w-3" />
                      CSV
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && result?.summary && (
                <div className="border-t border-gray-100 px-4 py-3">
                  <ParsedStatementDetail summary={result.summary} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── PARSED STATEMENT DETAIL VIEW ─────────────────────────────────────────

function ParsedStatementDetail({ summary }: { summary: StatementSummary }) {
  const [showAll, setShowAll] = useState(false)

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <MiniCard label="Type" value={STATEMENT_TYPE_LABELS[summary.statementType]} />
        {summary.bankName && <MiniCard label="Institution" value={summary.bankName} />}
        {summary.openingBalance !== null && <MiniCard label="Opening Balance" value={fmtDollar(summary.openingBalance)} />}
        {summary.closingBalance !== null && <MiniCard label="Closing Balance" value={fmtDollar(summary.closingBalance)} />}
        {summary.totalDebits > 0 && <MiniCard label="Total Debits" value={fmtDollar(summary.totalDebits)} negative />}
        {summary.totalCredits > 0 && <MiniCard label="Total Credits" value={fmtDollar(summary.totalCredits)} positive />}
        {summary.startDate && <MiniCard label="Period Start" value={summary.startDate} />}
        {summary.endDate && <MiniCard label="Period End" value={summary.endDate} />}
      </div>

      {/* Credit card specific */}
      {summary.creditCard && <CreditCardDetail cc={summary.creditCard} />}

      {/* Payroll specific */}
      {summary.payroll && <PayrollDetail payroll={summary.payroll} />}

      {/* Utility specific */}
      {summary.utility && <UtilityDetail utility={summary.utility} />}

      {/* Mortgage/loan specific */}
      {summary.mortgageLoan && <MortgageLoanDetail ml={summary.mortgageLoan} />}

      {/* Transaction table */}
      {summary.transactions.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-gray-500">
              Transactions ({summary.transactions.length})
            </p>
            {summary.transactions.length > 8 && (
              <button
                onClick={() => setShowAll(!showAll)}
                className="text-xs text-primary hover:underline"
              >
                {showAll ? 'Show less' : `Show all ${summary.transactions.length}`}
              </button>
            )}
          </div>
          <div className="overflow-hidden rounded-md border border-gray-100">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-left text-gray-500">
                  <th className="px-3 py-1.5 font-medium">Date</th>
                  <th className="px-3 py-1.5 font-medium">Description</th>
                  <th className="px-3 py-1.5 font-medium text-right">Amount</th>
                  <th className="px-3 py-1.5 font-medium">Category</th>
                </tr>
              </thead>
              <tbody>
                {(showAll ? summary.transactions : summary.transactions.slice(0, 8)).map((tx, i) => (
                  <tr key={i} className="border-t border-gray-50">
                    <td className="whitespace-nowrap px-3 py-1.5 text-gray-600">{tx.date || '—'}</td>
                    <td className="max-w-[200px] truncate px-3 py-1.5 text-gray-700">{tx.description}</td>
                    <td className={cn(
                      'whitespace-nowrap px-3 py-1.5 text-right font-mono',
                      tx.amount < 0 ? 'text-danger' : 'text-success',
                    )}>
                      {tx.amount < 0 ? '-' : '+'}${Math.abs(tx.amount).toFixed(2)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                        {tx.category ?? 'Uncategorized'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── TYPE-SPECIFIC DETAIL SECTIONS ────────────────────────────────────────

function CreditCardDetail({ cc }: { cc: NonNullable<StatementSummary['creditCard']> }) {
  return (
    <div className="rounded-md border border-blue-100 bg-blue-50/50 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-blue-700">
        <CreditCard className="h-3.5 w-3.5" />
        Credit Card Details
      </p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs lg:grid-cols-4">
        {cc.creditLimit !== null && <KV label="Credit Limit" value={fmtDollar(cc.creditLimit)} />}
        {cc.availableCredit !== null && <KV label="Available Credit" value={fmtDollar(cc.availableCredit)} />}
        {cc.minimumPayment !== null && <KV label="Min Payment" value={fmtDollar(cc.minimumPayment)} />}
        {cc.paymentDueDate && <KV label="Due Date" value={cc.paymentDueDate} />}
        {cc.apr !== null && <KV label="APR" value={`${cc.apr}%`} />}
        {cc.previousBalance !== null && <KV label="Previous Balance" value={fmtDollar(cc.previousBalance)} />}
        {cc.newCharges !== null && <KV label="New Charges" value={fmtDollar(cc.newCharges)} />}
        {cc.paymentsAndCredits !== null && <KV label="Payments/Credits" value={fmtDollar(cc.paymentsAndCredits)} />}
        {cc.newBalance !== null && <KV label="New Balance" value={fmtDollar(cc.newBalance)} />}
      </div>
    </div>
  )
}

function PayrollDetail({ payroll }: { payroll: NonNullable<StatementSummary['payroll']> }) {
  return (
    <div className="rounded-md border border-green-100 bg-green-50/50 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-green-700">
        <Receipt className="h-3.5 w-3.5" />
        Payroll Details{payroll.payrollProvider && ` — ${payroll.payrollProvider}`}
      </p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs lg:grid-cols-4">
        {payroll.payPeriodStart && payroll.payPeriodEnd && (
          <KV label="Pay Period" value={`${payroll.payPeriodStart} — ${payroll.payPeriodEnd}`} />
        )}
        {payroll.payDate && <KV label="Pay Date" value={payroll.payDate} />}
        {payroll.grossPay !== null && <KV label="Gross Pay" value={fmtDollar(payroll.grossPay)} />}
        {payroll.netPay !== null && <KV label="Net Pay" value={fmtDollar(payroll.netPay)} />}
        {payroll.totalDeductions !== null && <KV label="Total Deductions" value={fmtDollar(payroll.totalDeductions)} />}
        {payroll.federalTax !== null && <KV label="Federal Tax" value={fmtDollar(payroll.federalTax)} />}
        {payroll.stateTax !== null && <KV label="State Tax" value={fmtDollar(payroll.stateTax)} />}
        {payroll.socialSecurity !== null && <KV label="Social Security" value={fmtDollar(payroll.socialSecurity)} />}
        {payroll.medicare !== null && <KV label="Medicare" value={fmtDollar(payroll.medicare)} />}
        {payroll.healthInsurance !== null && <KV label="Health Insurance" value={fmtDollar(payroll.healthInsurance)} />}
        {payroll.retirement401k !== null && <KV label="401(k)" value={fmtDollar(payroll.retirement401k)} />}
        {payroll.employeeCount !== null && <KV label="Employees" value={String(payroll.employeeCount)} />}
      </div>
    </div>
  )
}

function UtilityDetail({ utility }: { utility: NonNullable<StatementSummary['utility']> }) {
  return (
    <div className="rounded-md border border-yellow-100 bg-yellow-50/50 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-yellow-700">
        <Zap className="h-3.5 w-3.5" />
        Utility Bill Details{utility.provider && ` — ${utility.provider}`}
      </p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs lg:grid-cols-4">
        {utility.serviceType && <KV label="Service" value={utility.serviceType.replace(/_/g, ' ')} />}
        {utility.accountNumber && <KV label="Account #" value={utility.accountNumber} />}
        {utility.billingPeriod && <KV label="Billing Period" value={utility.billingPeriod} />}
        {utility.amountDue !== null && <KV label="Amount Due" value={fmtDollar(utility.amountDue)} />}
        {utility.dueDate && <KV label="Due Date" value={utility.dueDate} />}
        {utility.previousBalance !== null && <KV label="Previous Balance" value={fmtDollar(utility.previousBalance)} />}
        {utility.usage && <KV label="Usage" value={utility.usage} />}
      </div>
    </div>
  )
}

function MortgageLoanDetail({ ml }: { ml: NonNullable<StatementSummary['mortgageLoan']> }) {
  const isMortgage = ml.loanType === 'mortgage'
  return (
    <div className={cn(
      'rounded-md border p-3',
      isMortgage ? 'border-purple-100 bg-purple-50/50' : 'border-indigo-100 bg-indigo-50/50',
    )}>
      <p className={cn(
        'mb-2 flex items-center gap-1.5 text-xs font-medium',
        isMortgage ? 'text-purple-700' : 'text-indigo-700',
      )}>
        {isMortgage ? <Home className="h-3.5 w-3.5" /> : <GraduationCap className="h-3.5 w-3.5" />}
        {isMortgage ? 'Mortgage Details' : 'Student Loan Details'}
        {ml.lender && ` — ${ml.lender}`}
      </p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs lg:grid-cols-4">
        {ml.accountNumber && <KV label="Account #" value={ml.accountNumber} />}
        {ml.principalBalance !== null && <KV label="Principal Balance" value={fmtDollar(ml.principalBalance)} />}
        {ml.interestRate !== null && <KV label="Interest Rate" value={`${ml.interestRate}%`} />}
        {ml.monthlyPayment !== null && <KV label="Monthly Payment" value={fmtDollar(ml.monthlyPayment)} />}
        {ml.principalPortion !== null && <KV label="Principal Portion" value={fmtDollar(ml.principalPortion)} />}
        {ml.interestPortion !== null && <KV label="Interest Portion" value={fmtDollar(ml.interestPortion)} />}
        {ml.escrowPortion !== null && <KV label="Escrow" value={fmtDollar(ml.escrowPortion)} />}
        {ml.nextPaymentDue && <KV label="Next Due" value={ml.nextPaymentDue} />}
        {ml.maturityDate && <KV label="Maturity Date" value={ml.maturityDate} />}
      </div>
    </div>
  )
}

// ─── SHARED UI HELPERS ────────────────────────────────────────────────────

function MiniCard({ label, value, positive, negative }: { label: string; value: string; positive?: boolean; negative?: boolean }) {
  return (
    <div className="rounded-md border border-gray-100 bg-gray-50 px-2.5 py-1.5">
      <p className="text-[10px] text-gray-400">{label}</p>
      <p className={cn(
        'text-sm font-medium',
        positive ? 'text-success' : negative ? 'text-danger' : 'text-gray-700',
      )}>
        {value}
      </p>
    </div>
  )
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 py-0.5">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-700">{value}</span>
    </div>
  )
}

function fmtDollar(amount: number): string {
  return `$${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ─── DEMO DATA GENERATION ─────────────────────────────────────────────────

function generateDemoParseResults(requirements: RequirementWithUploads[]): ParsedRequirement[] {
  const results: ParsedRequirement[] = []

  for (const req of requirements) {
    if (req.uploads.length === 0) continue
    const upload = req.uploads[0]
    if (!/\.(pdf|csv|qbo)$/i.test(upload.filename_original)) continue

    let summary: StatementSummary

    switch (req.doc_type) {
      case 'bank':
        summary = {
          statementType: 'bank',
          transactions: [
            { date: '03/01', description: 'Beginning Balance', amount: 0, balance: 24_532.18, category: 'Balance', raw: '' },
            { date: '03/02', description: 'STAPLES OFFICE SUPPLIES', amount: -47.82, balance: 24_484.36, category: 'Office Supplies', raw: '' },
            { date: '03/03', description: 'COMCAST BUSINESS', amount: -189.00, balance: 24_295.36, category: 'Utilities - Telecom', raw: '' },
            { date: '03/05', description: 'AMZN MKTP US', amount: -234.56, balance: 24_060.80, category: 'Office Supplies', raw: '' },
            { date: '03/08', description: 'GUSTO PAYROLL', amount: -4_500.00, balance: 19_560.80, category: 'Payroll', raw: '' },
            { date: '03/10', description: 'UBER TRIP', amount: -32.40, balance: 19_528.40, category: 'Transportation', raw: '' },
            { date: '03/12', description: 'FEDEX SHIPPING', amount: -18.95, balance: 19_509.45, category: 'Shipping', raw: '' },
            { date: '03/15', description: 'DEPOSIT - CLIENT PAYMENT', amount: 8_500.00, balance: 28_009.45, category: 'Income', raw: '' },
            { date: '03/18', description: 'CHASE INK CARD PAYMENT', amount: -523.41, balance: 27_486.04, category: 'Credit Card Payment', raw: '' },
            { date: '03/20', description: 'STARBUCKS', amount: -12.85, balance: 27_473.19, category: 'Meals & Entertainment', raw: '' },
            { date: '03/22', description: 'DEPOSIT - CLIENT PAYMENT', amount: 3_200.00, balance: 30_673.19, category: 'Income', raw: '' },
            { date: '03/25', description: 'ADOBE SYSTEMS', amount: -54.99, balance: 30_618.20, category: 'Software - SaaS', raw: '' },
            { date: '03/28', description: 'AT&T MOBILITY', amount: -85.00, balance: 30_533.20, category: 'Utilities - Telecom', raw: '' },
            { date: '03/30', description: 'DEPOSIT - TRANSFER', amount: 1_500.00, balance: 32_033.20, category: 'Transfer', raw: '' },
          ],
          startDate: '03/01',
          endDate: '03/30',
          openingBalance: 24_532.18,
          closingBalance: 32_033.20,
          totalDebits: 5_698.98,
          totalCredits: 13_200.00,
          pageCount: 3,
          bankName: req.label.includes('Chase') ? 'Chase' : req.label.includes('Wells') ? 'Wells Fargo' : req.label.includes('BofA') || req.label.includes('Bank of America') ? 'Bank of America' : req.label.includes('PNC') ? 'PNC' : req.label.includes('TD') ? 'TD Bank' : 'Chase',
        }
        break

      case 'credit_card':
        summary = {
          statementType: 'credit_card',
          transactions: [
            { date: '03/01', description: 'AMAZON.COM', amount: -89.99, category: 'Office Supplies', raw: '' },
            { date: '03/03', description: 'ZOOM.US', amount: -14.99, category: 'Software - SaaS', raw: '' },
            { date: '03/05', description: 'GOOGLE *CLOUD', amount: -156.23, category: 'Software - SaaS', raw: '' },
            { date: '03/08', description: 'STAPLES', amount: -43.67, category: 'Office Supplies', raw: '' },
            { date: '03/10', description: 'PAYMENT RECEIVED - THANK YOU', amount: 523.41, category: 'Payment', raw: '' },
            { date: '03/12', description: 'DELTA AIR LINES', amount: -342.00, category: 'Travel', raw: '' },
            { date: '03/15', description: 'HILTON HOTELS', amount: -189.00, category: 'Travel - Lodging', raw: '' },
            { date: '03/18', description: 'UBER TRIP', amount: -24.50, category: 'Transportation', raw: '' },
            { date: '03/22', description: 'SLACK TECHNOLOGIES', amount: -12.50, category: 'Software - SaaS', raw: '' },
            { date: '03/25', description: 'OFFICE DEPOT', amount: -67.34, category: 'Office Supplies', raw: '' },
          ],
          startDate: '03/01',
          endDate: '03/25',
          openingBalance: 523.41,
          closingBalance: 940.22,
          totalDebits: 940.22,
          totalCredits: 523.41,
          pageCount: 2,
          bankName: req.label.includes('Amex') || req.label.includes('American Express') ? 'American Express' : req.label.includes('Visa') ? 'Visa' : req.label.includes('Capital One') ? 'Capital One' : req.label.includes('Chase Ink') ? 'Chase' : 'Visa',
          creditCard: {
            creditLimit: 15_000,
            availableCredit: 14_059.78,
            minimumPayment: 25.00,
            paymentDueDate: '04/15',
            apr: 24.99,
            previousBalance: 523.41,
            newCharges: 940.22,
            paymentsAndCredits: 523.41,
            newBalance: 940.22,
          },
        }
        break

      case 'payroll':
        summary = {
          statementType: 'payroll',
          transactions: [
            { date: '03/31', description: 'Gross Payroll', amount: -12_500.00, category: 'Payroll', raw: '' },
            { date: '03/31', description: 'Federal Tax Withholding', amount: -1_875.00, category: 'Payroll Tax', raw: '' },
            { date: '03/31', description: 'State Tax Withholding', amount: -625.00, category: 'Payroll Tax', raw: '' },
            { date: '03/31', description: 'Social Security (FICA)', amount: -775.00, category: 'Payroll Tax', raw: '' },
            { date: '03/31', description: 'Medicare', amount: -181.25, category: 'Payroll Tax', raw: '' },
            { date: '03/31', description: 'Health Insurance', amount: -450.00, category: 'Insurance', raw: '' },
            { date: '03/31', description: '401(k) Contribution', amount: -375.00, category: 'Retirement', raw: '' },
          ],
          startDate: '03/01',
          endDate: '03/31',
          openingBalance: null,
          closingBalance: null,
          totalDebits: 16_781.25,
          totalCredits: 0,
          pageCount: 2,
          bankName: req.label.includes('Gusto') ? 'Gusto' : req.label.includes('ADP') ? 'ADP' : req.label.includes('QuickBooks') ? 'QuickBooks Payroll' : 'Gusto',
          payroll: {
            payPeriodStart: '03/01',
            payPeriodEnd: '03/31',
            payDate: '03/31',
            grossPay: 12_500.00,
            netPay: 8_218.75,
            totalDeductions: 4_281.25,
            federalTax: 1_875.00,
            stateTax: 625.00,
            socialSecurity: 775.00,
            medicare: 181.25,
            healthInsurance: 450.00,
            retirement401k: 375.00,
            employeeCount: 3,
            payrollProvider: req.label.includes('Gusto') ? 'Gusto' : req.label.includes('ADP') ? 'ADP' : 'Gusto',
          },
        }
        break

      default:
        // For receipts and other types, create a minimal bank-type result
        summary = {
          statementType: 'bank',
          transactions: [
            { date: '03/15', description: 'Various receipts', amount: -347.82, category: 'Uncategorized', raw: '' },
          ],
          startDate: '03/15',
          endDate: '03/15',
          openingBalance: null,
          closingBalance: null,
          totalDebits: 347.82,
          totalCredits: 0,
          pageCount: 1,
          bankName: null,
        }
    }

    results.push({
      requirementId: req.id,
      filename: upload.filename_original,
      summary,
      error: null,
      parsing: false,
    })
  }

  return results
}
