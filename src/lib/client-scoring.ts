// Client reliability scoring and ranking engine
// Gives bookkeepers data-driven insight into which clients are reliable vs problematic

export interface ClientScore {
  clientId: string
  businessName: string
  overallScore: number // 0-100
  grade: 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C' | 'D' | 'F'
  metrics: {
    onTimeRate: number // % of months all docs submitted by deadline
    completenessRate: number // % of required docs actually uploaded
    responseTime: number // avg days between reminder sent and upload
    documentQuality: number // % of docs that parsed successfully
    communicationScore: number // based on reminder count needed
  }
  trend: 'improving' | 'stable' | 'declining'
  trendDetail: string
  riskLevel: 'low' | 'medium' | 'high'
  riskFactors: string[]
  recommendations: string[]
  estimatedMonthlyEffort: number // hours bookkeeper spends on this client
  profitabilityIndicator: 'high' | 'medium' | 'low' // effort vs fee
}

export interface ClientRankingReport {
  rankings: ClientScore[]
  insights: {
    bestClient: string
    worstClient: string
    mostImproved: string | null
    avgScore: number
    avgOnTimeRate: number
    totalMonthlyHours: number
    atRiskClients: string[] // clients likely to churn or cause problems
  }
  recommendations: string[] // practice-wide advice
}

export interface MonthlyData {
  year: number
  month: number
  requiredDocs: number
  uploadedDocs: number
  onTime: boolean
  remindersSent: number
  avgDaysToRespond: number
  parsedSuccessfully: number
}

// --- Internal helpers ---

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function computeOnTimeRate(data: MonthlyData[]): number {
  if (data.length === 0) return 0
  const onTimeCount = data.filter((m) => m.onTime).length
  return (onTimeCount / data.length) * 100
}

function computeCompletenessRate(data: MonthlyData[]): number {
  if (data.length === 0) return 0
  const totalRequired = data.reduce((sum, m) => sum + m.requiredDocs, 0)
  if (totalRequired === 0) return 100
  const totalUploaded = data.reduce((sum, m) => sum + m.uploadedDocs, 0)
  return clamp((totalUploaded / totalRequired) * 100, 0, 100)
}

function computeResponseTimeScore(data: MonthlyData[]): number {
  if (data.length === 0) return 100
  const avgDays =
    data.reduce((sum, m) => sum + m.avgDaysToRespond, 0) / data.length
  // 0 days = 100, 1 day = 90, 3 days = 70, 7 days = 40, 14+ days = 0
  if (avgDays <= 0) return 100
  if (avgDays <= 1) return 90
  if (avgDays <= 3) return 70 + ((3 - avgDays) / 2) * 10
  if (avgDays <= 7) return 40 + ((7 - avgDays) / 4) * 30
  if (avgDays <= 14) return ((14 - avgDays) / 7) * 40
  return 0
}

function computeDocumentQuality(data: MonthlyData[]): number {
  if (data.length === 0) return 100
  const totalUploaded = data.reduce((sum, m) => sum + m.uploadedDocs, 0)
  if (totalUploaded === 0) return 0
  const totalParsed = data.reduce((sum, m) => sum + m.parsedSuccessfully, 0)
  return clamp((totalParsed / totalUploaded) * 100, 0, 100)
}

function computeCommunicationScore(data: MonthlyData[]): number {
  if (data.length === 0) return 100
  const avgReminders =
    data.reduce((sum, m) => sum + m.remindersSent, 0) / data.length
  // 0 reminders = 100, 1 = 80, 2 = 50, 3+ = 20, 4+ = 0
  if (avgReminders <= 0) return 100
  if (avgReminders <= 1) return 80
  if (avgReminders <= 2) return 50
  if (avgReminders <= 3) return 20
  return 0
}

function scoreToGrade(
  score: number
): 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C' | 'D' | 'F' {
  if (score >= 95) return 'A+'
  if (score >= 90) return 'A'
  if (score >= 85) return 'B+'
  if (score >= 75) return 'B'
  if (score >= 65) return 'C+'
  if (score >= 55) return 'C'
  if (score >= 40) return 'D'
  return 'F'
}

function computeWeightedScore(metrics: ClientScore['metrics']): number {
  const weighted =
    metrics.onTimeRate * 0.3 +
    metrics.completenessRate * 0.25 +
    metrics.responseTime * 0.2 +
    metrics.documentQuality * 0.15 +
    metrics.communicationScore * 0.1
  return clamp(Math.round(weighted * 10) / 10, 0, 100)
}

function computeTrend(
  data: MonthlyData[]
): { trend: 'improving' | 'stable' | 'declining'; detail: string } {
  if (data.length < 6) {
    return { trend: 'stable', detail: 'Not enough history to determine trend (need 6+ months)' }
  }

  // Sort by year/month ascending
  const sorted = [...data].sort(
    (a, b) => a.year * 12 + a.month - (b.year * 12 + b.month)
  )

  const recent = sorted.slice(-3)
  const previous = sorted.slice(-6, -3)

  function periodScore(months: MonthlyData[]): number {
    const onTime = months.filter((m) => m.onTime).length / months.length * 100
    const completeness = months.reduce((s, m) => s + m.uploadedDocs, 0) /
      Math.max(months.reduce((s, m) => s + m.requiredDocs, 0), 1) * 100
    return onTime * 0.5 + completeness * 0.5
  }

  const recentScore = periodScore(recent)
  const previousScore = periodScore(previous)
  const diff = recentScore - previousScore

  if (diff >= 5) {
    return {
      trend: 'improving',
      detail: `Score improved by ${Math.round(diff)} points over the last 3 months`,
    }
  }
  if (diff <= -5) {
    return {
      trend: 'declining',
      detail: `Score declined by ${Math.round(Math.abs(diff))} points over the last 3 months`,
    }
  }
  return { trend: 'stable', detail: 'Performance has been consistent over the last 6 months' }
}

function identifyRiskFactors(
  metrics: ClientScore['metrics'],
  trend: 'improving' | 'stable' | 'declining',
  data: MonthlyData[]
): string[] {
  const factors: string[] = []

  // Late >50% of time
  if (metrics.onTimeRate < 50) {
    factors.push(`Late submissions ${Math.round(100 - metrics.onTimeRate)}% of the time`)
  }

  // Declining trend
  if (trend === 'declining') {
    factors.push('Performance trending downward over recent months')
  }

  // Required 3+ reminders on average
  if (data.length > 0) {
    const avgReminders =
      data.reduce((s, m) => s + m.remindersSent, 0) / data.length
    if (avgReminders >= 3) {
      factors.push(
        `Averaging ${avgReminders.toFixed(1)} reminders per month (high maintenance)`
      )
    }
  }

  // Incomplete docs 2+ months in a row (check last entries)
  if (data.length >= 2) {
    const sorted = [...data].sort(
      (a, b) => a.year * 12 + a.month - (b.year * 12 + b.month)
    )
    const lastTwo = sorted.slice(-2)
    const consecutiveIncomplete = lastTwo.every(
      (m) => m.requiredDocs > 0 && m.uploadedDocs < m.requiredDocs
    )
    if (consecutiveIncomplete) {
      factors.push('Incomplete document submissions for 2+ consecutive months')
    }
  }

  // Low document quality
  if (metrics.documentQuality < 60) {
    factors.push(
      `Only ${Math.round(metrics.documentQuality)}% of uploaded documents parsed successfully`
    )
  }

  return factors
}

function determineRiskLevel(
  riskFactors: string[],
  overallScore: number
): 'low' | 'medium' | 'high' {
  if (riskFactors.length >= 3 || overallScore < 40) return 'high'
  if (riskFactors.length >= 1 || overallScore < 65) return 'medium'
  return 'low'
}

function generateRecommendations(
  score: number,
  grade: string,
  metrics: ClientScore['metrics'],
  trend: 'improving' | 'stable' | 'declining',
  riskLevel: 'low' | 'medium' | 'high',
  businessName: string
): string[] {
  const recs: string[] = []

  if (grade === 'A+' || grade === 'A') {
    recs.push(`${businessName} is a top performer -- consider asking for a referral`)
  }

  if (metrics.onTimeRate < 50) {
    recs.push('Schedule a call to discuss document submission expectations')
  }

  if (metrics.completenessRate < 70) {
    recs.push('Review document requirements -- they may be unclear or overwhelming')
  }

  if (metrics.communicationScore < 30) {
    recs.push('Client requires excessive follow-up -- discuss streamlining their process')
  }

  if (trend === 'declining' && score > 55) {
    recs.push('Performance is slipping -- proactive check-in recommended before it worsens')
  }

  if (trend === 'improving') {
    recs.push('Positive momentum -- acknowledge their improvement to reinforce good behavior')
  }

  if (riskLevel === 'high' && (grade === 'D' || grade === 'F')) {
    recs.push(
      `Consider whether ${businessName} is worth retaining -- high effort, low reliability`
    )
  }

  if (metrics.documentQuality < 50) {
    recs.push('Provide clearer file format instructions -- many uploads are failing to parse')
  }

  // Always return at least one recommendation
  if (recs.length === 0) {
    recs.push('No immediate action needed -- maintain current cadence')
  }

  return recs
}

function computeEstimatedEffort(data: MonthlyData[]): number {
  if (data.length === 0) return 0.5

  // Use the most recent 3 months (or whatever is available) to estimate
  const sorted = [...data].sort(
    (a, b) => a.year * 12 + a.month - (b.year * 12 + b.month)
  )
  const recent = sorted.slice(-3)

  const avgReminders =
    recent.reduce((s, m) => s + m.remindersSent, 0) / recent.length
  const avgCompleteness =
    recent.reduce(
      (s, m) => s + (m.requiredDocs > 0 ? m.uploadedDocs / m.requiredDocs : 1),
      0
    ) / recent.length
  const avgQuality =
    recent.reduce(
      (s, m) => s + (m.uploadedDocs > 0 ? m.parsedSuccessfully / m.uploadedDocs : 1),
      0
    ) / recent.length

  let hours = 0.5 // base
  hours += avgReminders * 0.25 // 0.25h per reminder
  if (avgCompleteness < 1) hours += 0.5 // incomplete docs
  if (avgQuality < 0.8) hours += 0.5 // low quality docs

  return Math.round(hours * 10) / 10
}

function determineProfitability(
  effort: number
): 'high' | 'medium' | 'low' {
  // Lower effort = higher profitability
  if (effort <= 1) return 'high'
  if (effort <= 2) return 'medium'
  return 'low'
}

// --- Public API ---

export function scoreClient(
  clientId: string,
  businessName: string,
  monthlyData: MonthlyData[]
): ClientScore {
  const onTimeRate = computeOnTimeRate(monthlyData)
  const completenessRate = computeCompletenessRate(monthlyData)
  const responseTimeScore = computeResponseTimeScore(monthlyData)
  const documentQuality = computeDocumentQuality(monthlyData)
  const communicationScore = computeCommunicationScore(monthlyData)

  const metrics: ClientScore['metrics'] = {
    onTimeRate,
    completenessRate,
    responseTime: responseTimeScore,
    documentQuality,
    communicationScore,
  }

  const overallScore = computeWeightedScore(metrics)
  const grade = scoreToGrade(overallScore)
  const { trend, detail: trendDetail } = computeTrend(monthlyData)
  const riskFactors = identifyRiskFactors(metrics, trend, monthlyData)
  const riskLevel = determineRiskLevel(riskFactors, overallScore)
  const recommendations = generateRecommendations(
    overallScore,
    grade,
    metrics,
    trend,
    riskLevel,
    businessName
  )
  const estimatedMonthlyEffort = computeEstimatedEffort(monthlyData)
  const profitabilityIndicator = determineProfitability(estimatedMonthlyEffort)

  return {
    clientId,
    businessName,
    overallScore,
    grade,
    metrics,
    trend,
    trendDetail,
    riskLevel,
    riskFactors,
    recommendations,
    estimatedMonthlyEffort,
    profitabilityIndicator,
  }
}

export function rankClients(scores: ClientScore[]): ClientRankingReport {
  if (scores.length === 0) {
    return {
      rankings: [],
      insights: {
        bestClient: '',
        worstClient: '',
        mostImproved: null,
        avgScore: 0,
        avgOnTimeRate: 0,
        totalMonthlyHours: 0,
        atRiskClients: [],
      },
      recommendations: ['Add clients and collect data to generate insights'],
    }
  }

  // Sort by overall score descending
  const rankings = [...scores].sort((a, b) => b.overallScore - a.overallScore)

  const bestClient = rankings[0].businessName
  const worstClient = rankings[rankings.length - 1].businessName

  const improving = rankings.filter((s) => s.trend === 'improving')
  // Pick the one with the biggest jump (highest score among improvers, as a proxy)
  const mostImproved =
    improving.length > 0
      ? improving.sort((a, b) => b.overallScore - a.overallScore)[0].businessName
      : null

  const avgScore =
    Math.round(
      (rankings.reduce((s, r) => s + r.overallScore, 0) / rankings.length) * 10
    ) / 10
  const avgOnTimeRate =
    Math.round(
      (rankings.reduce((s, r) => s + r.metrics.onTimeRate, 0) / rankings.length) *
        10
    ) / 10
  const totalMonthlyHours =
    Math.round(
      rankings.reduce((s, r) => s + r.estimatedMonthlyEffort, 0) * 10
    ) / 10

  const atRiskClients = rankings
    .filter((s) => s.riskLevel === 'high')
    .map((s) => s.businessName)

  // Generate practice-wide recommendations
  const practiceRecs: string[] = []

  // Identify clients to consider dropping
  const dropCandidates = rankings.filter(
    (s) => (s.grade === 'D' || s.grade === 'F') && s.trend === 'declining'
  )
  for (const c of dropCandidates) {
    practiceRecs.push(
      `Consider dropping ${c.businessName} (${c.grade} grade, declining trend)`
    )
  }

  // Identify referral opportunities
  const referralCandidates = rankings.filter(
    (s) =>
      (s.grade === 'A+' || s.grade === 'A') &&
      s.profitabilityIndicator === 'high'
  )
  for (const c of referralCandidates) {
    practiceRecs.push(
      `${c.businessName} is your most profitable client -- consider asking for a referral`
    )
  }

  // Overall practice health
  if (avgOnTimeRate < 60) {
    practiceRecs.push(
      'Practice-wide on-time rate is below 60% -- consider tightening reminder schedules or setting clearer deadlines'
    )
  }

  if (atRiskClients.length > rankings.length * 0.3) {
    practiceRecs.push(
      `${atRiskClients.length} of ${rankings.length} clients are high-risk -- review onboarding process and client expectations`
    )
  }

  if (totalMonthlyHours > rankings.length * 1.5) {
    practiceRecs.push(
      `Estimated ${totalMonthlyHours}h/month on document collection alone -- look for automation opportunities`
    )
  }

  if (mostImproved) {
    practiceRecs.push(
      `${mostImproved} is showing the most improvement -- reinforce with positive feedback`
    )
  }

  if (practiceRecs.length === 0) {
    practiceRecs.push(
      'Practice is running smoothly -- continue monitoring for early warning signs'
    )
  }

  return {
    rankings,
    insights: {
      bestClient,
      worstClient,
      mostImproved,
      avgScore,
      avgOnTimeRate,
      totalMonthlyHours,
      atRiskClients,
    },
    recommendations: practiceRecs,
  }
}
