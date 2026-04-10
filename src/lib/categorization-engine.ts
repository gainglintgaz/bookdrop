// src/lib/categorization-engine.ts
// Smart transaction auto-categorization engine.
// Replaces hours of manual categorization work that bookkeepers do every month.
// Runs entirely in the browser — no API calls, no data leaves the device.
//
// Features:
//   - 200+ built-in vendor-to-category mappings
//   - Fuzzy pattern matching for truncated bank statement descriptions
//   - IRS tax deduction category mapping
//   - Smart flagging (possible-personal, over-$500, needs-receipt, etc.)
//   - Description cleaning (strips card numbers, transaction codes, noise)

// ─── TYPES ────────────────────────────────────────────────────────────────

export interface CategorizedTransaction {
  originalDescription: string
  cleanedDescription: string
  category: string
  subcategory: string
  confidence: 'high' | 'medium' | 'low'
  matchedVendor: string | null
  taxDeductible: boolean
  deductionCategory: string | null
  flags: string[]
}

export interface CategorizationReport {
  transactions: CategorizedTransaction[]
  summary: {
    totalCategorized: number
    highConfidence: number
    mediumConfidence: number
    lowConfidence: number
    totalDeductible: number
    deductibleAmount: number
    flaggedCount: number
    categoryBreakdown: { category: string; count: number; total: number }[]
  }
}

// ─── CATEGORY TAXONOMY ────────────────────────────────────────────────────

export const CATEGORIES = {
  OFFICE_SUPPLIES: 'Office Supplies & Equipment',
  SOFTWARE: 'Software & Subscriptions',
  TRAVEL: 'Travel & Transportation',
  MEALS: 'Meals & Entertainment',
  UTILITIES: 'Utilities & Telecom',
  PROFESSIONAL: 'Professional Services',
  INSURANCE: 'Insurance',
  RENT: 'Rent & Facilities',
  PAYROLL: 'Payroll & Contractors',
  MARKETING: 'Marketing & Advertising',
  BANKING: 'Banking & Finance Fees',
  SHIPPING: 'Shipping & Postage',
  VEHICLE: 'Vehicle & Gas',
  EDUCATION: 'Education & Training',
  MEDICAL: 'Medical & Health',
  TAXES: 'Taxes & Government',
  CLIENT_ENTERTAINMENT: 'Client Entertainment',
  MISCELLANEOUS: 'Miscellaneous',
} as const

export type CategoryKey = keyof typeof CATEGORIES
export type CategoryValue = (typeof CATEGORIES)[CategoryKey]

// ─── IRS DEDUCTION CATEGORIES ─────────────────────────────────────────────

const IRS_DEDUCTION_MAP: Record<string, string> = {
  [CATEGORIES.OFFICE_SUPPLIES]: 'Office Expense',
  [CATEGORIES.SOFTWARE]: 'Office Expense',
  [CATEGORIES.TRAVEL]: 'Travel',
  [CATEGORIES.MEALS]: 'Meals (50% deductible)',
  [CATEGORIES.UTILITIES]: 'Utilities',
  [CATEGORIES.PROFESSIONAL]: 'Legal and Professional Services',
  [CATEGORIES.INSURANCE]: 'Insurance',
  [CATEGORIES.RENT]: 'Rent or Lease',
  [CATEGORIES.PAYROLL]: 'Wages and Salaries',
  [CATEGORIES.MARKETING]: 'Advertising',
  [CATEGORIES.BANKING]: 'Other Business Expense',
  [CATEGORIES.SHIPPING]: 'Office Expense',
  [CATEGORIES.VEHICLE]: 'Car and Truck Expenses',
  [CATEGORIES.EDUCATION]: 'Education',
  [CATEGORIES.MEDICAL]: 'Medical',
  [CATEGORIES.TAXES]: 'Taxes and Licenses',
  [CATEGORIES.CLIENT_ENTERTAINMENT]: 'Meals (50% deductible)',
  [CATEGORIES.MISCELLANEOUS]: 'Other Business Expense',
}

// Categories that are NOT typically tax deductible as business expenses
const NON_DEDUCTIBLE_CATEGORIES: Set<string> = new Set([
  CATEGORIES.MISCELLANEOUS,
])

// ─── VENDOR DATABASE ──────────────────────────────────────────────────────
// Each entry: [patterns[], category, subcategory, possiblePersonal]
// patterns are lowercase substrings that match against cleaned descriptions.

interface VendorEntry {
  name: string
  patterns: string[]
  category: CategoryValue
  subcategory: string
  possiblePersonal: boolean
}

const VENDOR_DATABASE: VendorEntry[] = [
  // ── Office Supplies & Equipment ──────────────────────────────────────
  { name: 'Staples', patterns: ['staples'], category: CATEGORIES.OFFICE_SUPPLIES, subcategory: 'Office Store', possiblePersonal: false },
  { name: 'Office Depot', patterns: ['office depot', 'officedepot', 'officemax'], category: CATEGORIES.OFFICE_SUPPLIES, subcategory: 'Office Store', possiblePersonal: false },
  { name: 'Amazon', patterns: ['amzn', 'amazon', 'amz mktp', 'amzn mktp'], category: CATEGORIES.OFFICE_SUPPLIES, subcategory: 'Online Retailer', possiblePersonal: false },
  { name: 'Best Buy', patterns: ['best buy', 'bestbuy', 'bby'], category: CATEGORIES.OFFICE_SUPPLIES, subcategory: 'Electronics', possiblePersonal: false },
  { name: 'Apple Store', patterns: ['apple store', 'apple.com'], category: CATEGORIES.OFFICE_SUPPLIES, subcategory: 'Electronics', possiblePersonal: true },
  { name: 'Dell', patterns: ['dell', 'dell technologies'], category: CATEGORIES.OFFICE_SUPPLIES, subcategory: 'Computer Equipment', possiblePersonal: false },
  { name: 'HP', patterns: ['hp.com', 'hp inc', 'hewlett'], category: CATEGORIES.OFFICE_SUPPLIES, subcategory: 'Computer Equipment', possiblePersonal: false },
  { name: 'Lenovo', patterns: ['lenovo'], category: CATEGORIES.OFFICE_SUPPLIES, subcategory: 'Computer Equipment', possiblePersonal: false },
  { name: 'Newegg', patterns: ['newegg'], category: CATEGORIES.OFFICE_SUPPLIES, subcategory: 'Electronics', possiblePersonal: false },
  { name: 'B&H Photo', patterns: ['b&h photo', 'bhphoto', 'b and h'], category: CATEGORIES.OFFICE_SUPPLIES, subcategory: 'Electronics', possiblePersonal: false },
  { name: 'Micro Center', patterns: ['micro center', 'microcenter'], category: CATEGORIES.OFFICE_SUPPLIES, subcategory: 'Electronics', possiblePersonal: false },
  { name: 'Home Depot', patterns: ['home depot', 'homedepot'], category: CATEGORIES.OFFICE_SUPPLIES, subcategory: 'Facility Supplies', possiblePersonal: true },
  { name: "Lowe's", patterns: ['lowes', "lowe's"], category: CATEGORIES.OFFICE_SUPPLIES, subcategory: 'Facility Supplies', possiblePersonal: true },
  { name: 'IKEA', patterns: ['ikea'], category: CATEGORIES.OFFICE_SUPPLIES, subcategory: 'Furniture', possiblePersonal: true },
  { name: 'Costco', patterns: ['costco'], category: CATEGORIES.OFFICE_SUPPLIES, subcategory: 'Wholesale', possiblePersonal: true },
  { name: "Sam's Club", patterns: ['sams club', "sam's club", 'samsclub'], category: CATEGORIES.OFFICE_SUPPLIES, subcategory: 'Wholesale', possiblePersonal: true },

  // ── Software & Subscriptions ─────────────────────────────────────────
  { name: 'Adobe', patterns: ['adobe', 'paypal *adobe'], category: CATEGORIES.SOFTWARE, subcategory: 'Design Software', possiblePersonal: false },
  { name: 'Microsoft', patterns: ['microsoft', 'msft', 'microsoft 365', 'ms office'], category: CATEGORIES.SOFTWARE, subcategory: 'Productivity', possiblePersonal: false },
  { name: 'Google Workspace', patterns: ['google workspace', 'google *workspace', 'google cloud', 'google *cloud', 'google *gsuite'], category: CATEGORIES.SOFTWARE, subcategory: 'Productivity', possiblePersonal: false },
  { name: 'Slack', patterns: ['slack', 'slack technologies'], category: CATEGORIES.SOFTWARE, subcategory: 'Communication', possiblePersonal: false },
  { name: 'Zoom', patterns: ['zoom.us', 'zoom video', 'zoom communications'], category: CATEGORIES.SOFTWARE, subcategory: 'Communication', possiblePersonal: false },
  { name: 'Dropbox', patterns: ['dropbox'], category: CATEGORIES.SOFTWARE, subcategory: 'Cloud Storage', possiblePersonal: true },
  { name: 'GitHub', patterns: ['github'], category: CATEGORIES.SOFTWARE, subcategory: 'Development', possiblePersonal: false },
  { name: 'Atlassian', patterns: ['atlassian', 'jira', 'confluence', 'bitbucket'], category: CATEGORIES.SOFTWARE, subcategory: 'Development', possiblePersonal: false },
  { name: 'Salesforce', patterns: ['salesforce', 'sfdc'], category: CATEGORIES.SOFTWARE, subcategory: 'CRM', possiblePersonal: false },
  { name: 'HubSpot', patterns: ['hubspot'], category: CATEGORIES.SOFTWARE, subcategory: 'CRM', possiblePersonal: false },
  { name: 'QuickBooks', patterns: ['quickbooks', 'intuit', 'qb online', 'quickbooks online'], category: CATEGORIES.SOFTWARE, subcategory: 'Accounting', possiblePersonal: false },
  { name: 'Xero', patterns: ['xero'], category: CATEGORIES.SOFTWARE, subcategory: 'Accounting', possiblePersonal: false },
  { name: 'FreshBooks', patterns: ['freshbooks'], category: CATEGORIES.SOFTWARE, subcategory: 'Accounting', possiblePersonal: false },
  { name: 'Notion', patterns: ['notion.so', 'notion labs'], category: CATEGORIES.SOFTWARE, subcategory: 'Productivity', possiblePersonal: false },
  { name: 'Canva', patterns: ['canva'], category: CATEGORIES.SOFTWARE, subcategory: 'Design Software', possiblePersonal: false },
  { name: 'Figma', patterns: ['figma'], category: CATEGORIES.SOFTWARE, subcategory: 'Design Software', possiblePersonal: false },
  { name: 'Shopify', patterns: ['shopify'], category: CATEGORIES.SOFTWARE, subcategory: 'E-Commerce', possiblePersonal: false },
  { name: 'Squarespace', patterns: ['squarespace'], category: CATEGORIES.SOFTWARE, subcategory: 'Website', possiblePersonal: false },
  { name: 'Wix', patterns: ['wix.com', 'wix '], category: CATEGORIES.SOFTWARE, subcategory: 'Website', possiblePersonal: false },
  { name: 'GoDaddy', patterns: ['godaddy', 'go daddy'], category: CATEGORIES.SOFTWARE, subcategory: 'Domain/Hosting', possiblePersonal: false },
  { name: 'Namecheap', patterns: ['namecheap'], category: CATEGORIES.SOFTWARE, subcategory: 'Domain/Hosting', possiblePersonal: false },
  { name: 'AWS', patterns: ['aws', 'amazon web services', 'amazonaws'], category: CATEGORIES.SOFTWARE, subcategory: 'Cloud Infrastructure', possiblePersonal: false },
  { name: 'Vercel', patterns: ['vercel'], category: CATEGORIES.SOFTWARE, subcategory: 'Cloud Infrastructure', possiblePersonal: false },
  { name: 'Heroku', patterns: ['heroku'], category: CATEGORIES.SOFTWARE, subcategory: 'Cloud Infrastructure', possiblePersonal: false },
  { name: 'DigitalOcean', patterns: ['digitalocean', 'digital ocean'], category: CATEGORIES.SOFTWARE, subcategory: 'Cloud Infrastructure', possiblePersonal: false },
  { name: 'Mailchimp', patterns: ['mailchimp'], category: CATEGORIES.SOFTWARE, subcategory: 'Email Marketing', possiblePersonal: false },
  { name: 'SendGrid', patterns: ['sendgrid'], category: CATEGORIES.SOFTWARE, subcategory: 'Email Service', possiblePersonal: false },
  { name: 'Twilio', patterns: ['twilio'], category: CATEGORIES.SOFTWARE, subcategory: 'Communication API', possiblePersonal: false },
  { name: 'Calendly', patterns: ['calendly'], category: CATEGORIES.SOFTWARE, subcategory: 'Scheduling', possiblePersonal: false },
  { name: 'DocuSign', patterns: ['docusign'], category: CATEGORIES.SOFTWARE, subcategory: 'Document Management', possiblePersonal: false },
  { name: 'Asana', patterns: ['asana'], category: CATEGORIES.SOFTWARE, subcategory: 'Project Management', possiblePersonal: false },
  { name: 'Monday.com', patterns: ['monday.com'], category: CATEGORIES.SOFTWARE, subcategory: 'Project Management', possiblePersonal: false },
  { name: 'Trello', patterns: ['trello'], category: CATEGORIES.SOFTWARE, subcategory: 'Project Management', possiblePersonal: false },
  { name: '1Password', patterns: ['1password', 'agilebits'], category: CATEGORIES.SOFTWARE, subcategory: 'Security', possiblePersonal: false },
  { name: 'LastPass', patterns: ['lastpass'], category: CATEGORIES.SOFTWARE, subcategory: 'Security', possiblePersonal: false },
  { name: 'Norton', patterns: ['norton', 'symantec', 'nortonlifelock'], category: CATEGORIES.SOFTWARE, subcategory: 'Security', possiblePersonal: true },
  { name: 'McAfee', patterns: ['mcafee'], category: CATEGORIES.SOFTWARE, subcategory: 'Security', possiblePersonal: true },
  { name: 'Grammarly', patterns: ['grammarly'], category: CATEGORIES.SOFTWARE, subcategory: 'Productivity', possiblePersonal: true },
  { name: 'LinkedIn Premium', patterns: ['linkedin'], category: CATEGORIES.SOFTWARE, subcategory: 'Professional Network', possiblePersonal: true },
  { name: 'ChatGPT / OpenAI', patterns: ['openai', 'chatgpt'], category: CATEGORIES.SOFTWARE, subcategory: 'AI Tools', possiblePersonal: false },
  { name: 'Anthropic / Claude', patterns: ['anthropic', 'claude.ai'], category: CATEGORIES.SOFTWARE, subcategory: 'AI Tools', possiblePersonal: false },

  // ── Travel & Transportation ──────────────────────────────────────────
  { name: 'Delta Airlines', patterns: ['delta air', 'delta.com'], category: CATEGORIES.TRAVEL, subcategory: 'Airfare', possiblePersonal: false },
  { name: 'Southwest Airlines', patterns: ['southwest', 'southwst'], category: CATEGORIES.TRAVEL, subcategory: 'Airfare', possiblePersonal: false },
  { name: 'United Airlines', patterns: ['united air', 'united.com'], category: CATEGORIES.TRAVEL, subcategory: 'Airfare', possiblePersonal: false },
  { name: 'American Airlines', patterns: ['american air', 'aa.com'], category: CATEGORIES.TRAVEL, subcategory: 'Airfare', possiblePersonal: false },
  { name: 'JetBlue', patterns: ['jetblue'], category: CATEGORIES.TRAVEL, subcategory: 'Airfare', possiblePersonal: false },
  { name: 'Spirit Airlines', patterns: ['spirit air', 'spirit airlines'], category: CATEGORIES.TRAVEL, subcategory: 'Airfare', possiblePersonal: false },
  { name: 'Frontier Airlines', patterns: ['frontier air'], category: CATEGORIES.TRAVEL, subcategory: 'Airfare', possiblePersonal: false },
  { name: 'Alaska Airlines', patterns: ['alaska air'], category: CATEGORIES.TRAVEL, subcategory: 'Airfare', possiblePersonal: false },
  { name: 'Uber', patterns: ['uber', 'uber *trip', 'uber* trip', 'uber trip'], category: CATEGORIES.TRAVEL, subcategory: 'Rideshare', possiblePersonal: true },
  { name: 'Lyft', patterns: ['lyft'], category: CATEGORIES.TRAVEL, subcategory: 'Rideshare', possiblePersonal: true },
  { name: 'Hilton', patterns: ['hilton', 'hampton inn', 'doubletree', 'embassy suites', 'homewood suites', 'hilton garden'], category: CATEGORIES.TRAVEL, subcategory: 'Hotel', possiblePersonal: false },
  { name: 'Marriott', patterns: ['marriott', 'courtyard by', 'fairfield inn', 'residence inn', 'springhill suites', 'westin', 'sheraton', 'ritz carlton', 'st regis'], category: CATEGORIES.TRAVEL, subcategory: 'Hotel', possiblePersonal: false },
  { name: 'Hyatt', patterns: ['hyatt'], category: CATEGORIES.TRAVEL, subcategory: 'Hotel', possiblePersonal: false },
  { name: 'IHG', patterns: ['holiday inn', 'crowne plaza', 'ihg'], category: CATEGORIES.TRAVEL, subcategory: 'Hotel', possiblePersonal: false },
  { name: 'Best Western', patterns: ['best western'], category: CATEGORIES.TRAVEL, subcategory: 'Hotel', possiblePersonal: false },
  { name: 'Airbnb', patterns: ['airbnb'], category: CATEGORIES.TRAVEL, subcategory: 'Lodging', possiblePersonal: true },
  { name: 'Expedia', patterns: ['expedia'], category: CATEGORIES.TRAVEL, subcategory: 'Travel Booking', possiblePersonal: false },
  { name: 'Booking.com', patterns: ['booking.com'], category: CATEGORIES.TRAVEL, subcategory: 'Travel Booking', possiblePersonal: false },
  { name: 'Hertz', patterns: ['hertz'], category: CATEGORIES.TRAVEL, subcategory: 'Car Rental', possiblePersonal: false },
  { name: 'Enterprise Rent-A-Car', patterns: ['enterprise rent', 'enterprise rac', 'erac'], category: CATEGORIES.TRAVEL, subcategory: 'Car Rental', possiblePersonal: false },
  { name: 'National Car Rental', patterns: ['national car', 'natl car'], category: CATEGORIES.TRAVEL, subcategory: 'Car Rental', possiblePersonal: false },
  { name: 'Avis', patterns: ['avis rent', 'avis car'], category: CATEGORIES.TRAVEL, subcategory: 'Car Rental', possiblePersonal: false },
  { name: 'Budget Rent-A-Car', patterns: ['budget rent', 'budget car'], category: CATEGORIES.TRAVEL, subcategory: 'Car Rental', possiblePersonal: false },
  { name: 'Amtrak', patterns: ['amtrak'], category: CATEGORIES.TRAVEL, subcategory: 'Train', possiblePersonal: false },
  { name: 'Greyhound', patterns: ['greyhound'], category: CATEGORIES.TRAVEL, subcategory: 'Bus', possiblePersonal: false },
  { name: 'Parking', patterns: ['parking', 'parkwhiz', 'spothero', 'park mobile', 'parkmobile', 'meter'], category: CATEGORIES.TRAVEL, subcategory: 'Parking', possiblePersonal: false },
  { name: 'Toll', patterns: ['ez pass', 'ezpass', 'toll', 'sunpass', 'fastrak', 'i-pass', 'pikepass'], category: CATEGORIES.TRAVEL, subcategory: 'Tolls', possiblePersonal: true },

  // ── Meals & Entertainment ────────────────────────────────────────────
  { name: 'Starbucks', patterns: ['starbucks', 'sq *starbucks'], category: CATEGORIES.MEALS, subcategory: 'Coffee', possiblePersonal: true },
  { name: 'Dunkin', patterns: ["dunkin", "dunkin'"], category: CATEGORIES.MEALS, subcategory: 'Coffee', possiblePersonal: true },
  { name: 'Panera', patterns: ['panera'], category: CATEGORIES.MEALS, subcategory: 'Restaurant', possiblePersonal: true },
  { name: 'Chipotle', patterns: ['chipotle'], category: CATEGORIES.MEALS, subcategory: 'Restaurant', possiblePersonal: true },
  { name: 'Chick-fil-A', patterns: ['chick-fil-a', 'chick fil a', 'chickfila'], category: CATEGORIES.MEALS, subcategory: 'Restaurant', possiblePersonal: true },
  { name: "McDonald's", patterns: ['mcdonalds', "mcdonald's", 'mcd '], category: CATEGORIES.MEALS, subcategory: 'Restaurant', possiblePersonal: true },
  { name: "Wendy's", patterns: ["wendy's", 'wendys'], category: CATEGORIES.MEALS, subcategory: 'Restaurant', possiblePersonal: true },
  { name: 'Subway', patterns: ['subway'], category: CATEGORIES.MEALS, subcategory: 'Restaurant', possiblePersonal: true },
  { name: 'Taco Bell', patterns: ['taco bell'], category: CATEGORIES.MEALS, subcategory: 'Restaurant', possiblePersonal: true },
  { name: 'Pizza Hut', patterns: ['pizza hut'], category: CATEGORIES.MEALS, subcategory: 'Restaurant', possiblePersonal: true },
  { name: "Domino's", patterns: ["domino's", 'dominos'], category: CATEGORIES.MEALS, subcategory: 'Restaurant', possiblePersonal: true },
  { name: 'Burger King', patterns: ['burger king'], category: CATEGORIES.MEALS, subcategory: 'Restaurant', possiblePersonal: true },
  { name: 'Five Guys', patterns: ['five guys'], category: CATEGORIES.MEALS, subcategory: 'Restaurant', possiblePersonal: true },
  { name: 'Olive Garden', patterns: ['olive garden', 'darden'], category: CATEGORIES.MEALS, subcategory: 'Restaurant', possiblePersonal: true },
  { name: 'Applebees', patterns: ["applebee's", 'applebees'], category: CATEGORIES.MEALS, subcategory: 'Restaurant', possiblePersonal: true },
  { name: "Chili's", patterns: ["chili's", 'chilis'], category: CATEGORIES.MEALS, subcategory: 'Restaurant', possiblePersonal: true },
  { name: 'DoorDash', patterns: ['doordash', 'dd *'], category: CATEGORIES.MEALS, subcategory: 'Delivery', possiblePersonal: true },
  { name: 'Uber Eats', patterns: ['uber eats', 'uber *eats', 'ubereats'], category: CATEGORIES.MEALS, subcategory: 'Delivery', possiblePersonal: true },
  { name: 'Grubhub', patterns: ['grubhub'], category: CATEGORIES.MEALS, subcategory: 'Delivery', possiblePersonal: true },
  { name: 'Instacart', patterns: ['instacart'], category: CATEGORIES.MEALS, subcategory: 'Delivery', possiblePersonal: true },

  // ── Utilities & Telecom ──────────────────────────────────────────────
  { name: 'AT&T', patterns: ['at&t', 'att ', 'att.com', 'att*'], category: CATEGORIES.UTILITIES, subcategory: 'Telecom', possiblePersonal: true },
  { name: 'Verizon', patterns: ['verizon', 'vzw'], category: CATEGORIES.UTILITIES, subcategory: 'Telecom', possiblePersonal: true },
  { name: 'T-Mobile', patterns: ['t-mobile', 'tmobile'], category: CATEGORIES.UTILITIES, subcategory: 'Telecom', possiblePersonal: true },
  { name: 'Comcast', patterns: ['comcast', 'xfinity'], category: CATEGORIES.UTILITIES, subcategory: 'Internet', possiblePersonal: true },
  { name: 'Spectrum', patterns: ['spectrum', 'charter comm'], category: CATEGORIES.UTILITIES, subcategory: 'Internet', possiblePersonal: true },
  { name: 'Cox Communications', patterns: ['cox comm', 'cox cable'], category: CATEGORIES.UTILITIES, subcategory: 'Internet', possiblePersonal: true },
  { name: 'CenturyLink / Lumen', patterns: ['centurylink', 'lumen tech'], category: CATEGORIES.UTILITIES, subcategory: 'Internet', possiblePersonal: true },
  { name: 'Google Fiber', patterns: ['google fiber'], category: CATEGORIES.UTILITIES, subcategory: 'Internet', possiblePersonal: true },
  { name: 'Electric Company', patterns: ['electric', 'power company', 'energy', 'duke energy', 'pge', 'pg&e', 'con edison', 'coned', 'dominion energy', 'southern co', 'entergy', 'xcel energy', 'eversource', 'dte energy', 'national grid', 'fpl', 'florida power'], category: CATEGORIES.UTILITIES, subcategory: 'Electric', possiblePersonal: true },
  { name: 'Gas Company', patterns: ['gas company', 'natural gas', 'atmos energy', 'nicor gas', 'centerpoint'], category: CATEGORIES.UTILITIES, subcategory: 'Gas', possiblePersonal: true },
  { name: 'Water Company', patterns: ['water utility', 'water dept', 'water co', 'american water'], category: CATEGORIES.UTILITIES, subcategory: 'Water', possiblePersonal: true },

  // ── Professional Services ────────────────────────────────────────────
  { name: 'LegalZoom', patterns: ['legalzoom'], category: CATEGORIES.PROFESSIONAL, subcategory: 'Legal', possiblePersonal: false },
  { name: 'H&R Block', patterns: ['h&r block', 'hrblock', 'hr block'], category: CATEGORIES.PROFESSIONAL, subcategory: 'Tax Preparation', possiblePersonal: true },
  { name: 'TurboTax', patterns: ['turbotax'], category: CATEGORIES.PROFESSIONAL, subcategory: 'Tax Preparation', possiblePersonal: true },
  { name: 'Gusto', patterns: ['gusto', 'zenpayroll'], category: CATEGORIES.PROFESSIONAL, subcategory: 'Payroll Service', possiblePersonal: false },
  { name: 'ADP', patterns: ['adp ', 'adp*', 'adp payroll', 'adp tax'], category: CATEGORIES.PROFESSIONAL, subcategory: 'Payroll Service', possiblePersonal: false },
  { name: 'Paychex', patterns: ['paychex'], category: CATEGORIES.PROFESSIONAL, subcategory: 'Payroll Service', possiblePersonal: false },
  { name: 'Fiverr', patterns: ['fiverr'], category: CATEGORIES.PROFESSIONAL, subcategory: 'Freelancer', possiblePersonal: false },
  { name: 'Upwork', patterns: ['upwork'], category: CATEGORIES.PROFESSIONAL, subcategory: 'Freelancer', possiblePersonal: false },
  { name: 'Regus / IWG', patterns: ['regus', 'iwg', 'wework', 'spaces'], category: CATEGORIES.PROFESSIONAL, subcategory: 'Coworking', possiblePersonal: false },
  { name: 'WeWork', patterns: ['wework'], category: CATEGORIES.PROFESSIONAL, subcategory: 'Coworking', possiblePersonal: false },

  // ── Insurance ────────────────────────────────────────────────────────
  { name: 'State Farm', patterns: ['state farm'], category: CATEGORIES.INSURANCE, subcategory: 'Business Insurance', possiblePersonal: true },
  { name: 'Geico', patterns: ['geico'], category: CATEGORIES.INSURANCE, subcategory: 'Vehicle Insurance', possiblePersonal: true },
  { name: 'Progressive', patterns: ['progressive'], category: CATEGORIES.INSURANCE, subcategory: 'Vehicle Insurance', possiblePersonal: true },
  { name: 'Allstate', patterns: ['allstate'], category: CATEGORIES.INSURANCE, subcategory: 'Business Insurance', possiblePersonal: true },
  { name: 'Nationwide', patterns: ['nationwide'], category: CATEGORIES.INSURANCE, subcategory: 'Business Insurance', possiblePersonal: true },
  { name: 'Hartford', patterns: ['hartford', 'the hartford'], category: CATEGORIES.INSURANCE, subcategory: 'Business Insurance', possiblePersonal: false },
  { name: 'Liberty Mutual', patterns: ['liberty mutual'], category: CATEGORIES.INSURANCE, subcategory: 'Business Insurance', possiblePersonal: true },
  { name: 'USAA', patterns: ['usaa'], category: CATEGORIES.INSURANCE, subcategory: 'Insurance', possiblePersonal: true },
  { name: 'Travelers', patterns: ['travelers ins', 'travelers '], category: CATEGORIES.INSURANCE, subcategory: 'Business Insurance', possiblePersonal: false },

  // ── Rent & Facilities ────────────────────────────────────────────────
  { name: 'Regus', patterns: ['regus office'], category: CATEGORIES.RENT, subcategory: 'Office Lease', possiblePersonal: false },
  { name: 'ServPro', patterns: ['servpro'], category: CATEGORIES.RENT, subcategory: 'Maintenance', possiblePersonal: false },
  { name: 'Stanley Steemer', patterns: ['stanley steemer'], category: CATEGORIES.RENT, subcategory: 'Cleaning', possiblePersonal: true },
  { name: 'ADT', patterns: ['adt security', 'adt '], category: CATEGORIES.RENT, subcategory: 'Security', possiblePersonal: true },
  { name: 'SimpliSafe', patterns: ['simplisafe'], category: CATEGORIES.RENT, subcategory: 'Security', possiblePersonal: true },

  // ── Payroll & Contractors ────────────────────────────────────────────
  { name: 'Gusto Payroll', patterns: ['gusto payroll'], category: CATEGORIES.PAYROLL, subcategory: 'Payroll Processing', possiblePersonal: false },
  { name: 'ADP Payroll', patterns: ['adp payroll', 'adp run'], category: CATEGORIES.PAYROLL, subcategory: 'Payroll Processing', possiblePersonal: false },
  { name: 'Square Payroll', patterns: ['sq payroll', 'square payroll'], category: CATEGORIES.PAYROLL, subcategory: 'Payroll Processing', possiblePersonal: false },

  // ── Marketing & Advertising ──────────────────────────────────────────
  { name: 'Google Ads', patterns: ['google ads', 'google *ads', 'adwords'], category: CATEGORIES.MARKETING, subcategory: 'Online Advertising', possiblePersonal: false },
  { name: 'Facebook Ads', patterns: ['facebook', 'fb ads', 'meta platforms', 'meta *ads', 'facebk', 'instagram'], category: CATEGORIES.MARKETING, subcategory: 'Social Media Ads', possiblePersonal: false },
  { name: 'LinkedIn Ads', patterns: ['linkedin ads', 'linkedin *ads'], category: CATEGORIES.MARKETING, subcategory: 'Social Media Ads', possiblePersonal: false },
  { name: 'Yelp', patterns: ['yelp'], category: CATEGORIES.MARKETING, subcategory: 'Directory Listing', possiblePersonal: false },
  { name: 'Vistaprint', patterns: ['vistaprint'], category: CATEGORIES.MARKETING, subcategory: 'Print Marketing', possiblePersonal: false },
  { name: 'Moo', patterns: ['moo.com', 'moo inc'], category: CATEGORIES.MARKETING, subcategory: 'Print Marketing', possiblePersonal: false },
  { name: 'Constant Contact', patterns: ['constant contact'], category: CATEGORIES.MARKETING, subcategory: 'Email Marketing', possiblePersonal: false },
  { name: 'Hootsuite', patterns: ['hootsuite'], category: CATEGORIES.MARKETING, subcategory: 'Social Media Management', possiblePersonal: false },
  { name: 'Buffer', patterns: ['buffer.com', 'buffer app'], category: CATEGORIES.MARKETING, subcategory: 'Social Media Management', possiblePersonal: false },
  { name: 'SEMrush', patterns: ['semrush'], category: CATEGORIES.MARKETING, subcategory: 'SEO', possiblePersonal: false },
  { name: 'Ahrefs', patterns: ['ahrefs'], category: CATEGORIES.MARKETING, subcategory: 'SEO', possiblePersonal: false },

  // ── Banking & Finance Fees ───────────────────────────────────────────
  { name: 'Chase Bank', patterns: ['chase fee', 'chase bank', 'chase credit'], category: CATEGORIES.BANKING, subcategory: 'Bank Fee', possiblePersonal: false },
  { name: 'Bank of America', patterns: ['bank of america', 'bofa', 'boa fee'], category: CATEGORIES.BANKING, subcategory: 'Bank Fee', possiblePersonal: false },
  { name: 'Wells Fargo', patterns: ['wells fargo', 'wf fee'], category: CATEGORIES.BANKING, subcategory: 'Bank Fee', possiblePersonal: false },
  { name: 'Square', patterns: ['sq *', 'square inc', 'square fee', 'gosq'], category: CATEGORIES.BANKING, subcategory: 'Payment Processing', possiblePersonal: false },
  { name: 'Stripe', patterns: ['stripe', 'stripe fee'], category: CATEGORIES.BANKING, subcategory: 'Payment Processing', possiblePersonal: false },
  { name: 'PayPal', patterns: ['paypal'], category: CATEGORIES.BANKING, subcategory: 'Payment Processing', possiblePersonal: true },
  { name: 'Venmo', patterns: ['venmo'], category: CATEGORIES.BANKING, subcategory: 'Payment Processing', possiblePersonal: true },
  { name: 'Wire Transfer', patterns: ['wire transfer', 'wire fee', 'incoming wire', 'outgoing wire'], category: CATEGORIES.BANKING, subcategory: 'Wire Fee', possiblePersonal: false },
  { name: 'Overdraft Fee', patterns: ['overdraft', 'nsf fee', 'insufficient funds'], category: CATEGORIES.BANKING, subcategory: 'Overdraft Fee', possiblePersonal: false },
  { name: 'Service Charge', patterns: ['service charge', 'monthly fee', 'maintenance fee', 'account fee'], category: CATEGORIES.BANKING, subcategory: 'Service Fee', possiblePersonal: false },
  { name: 'ATM Fee', patterns: ['atm fee', 'atm surcharge', 'non-network atm'], category: CATEGORIES.BANKING, subcategory: 'ATM Fee', possiblePersonal: false },

  // ── Shipping & Postage ───────────────────────────────────────────────
  { name: 'FedEx', patterns: ['fedex', 'fed ex'], category: CATEGORIES.SHIPPING, subcategory: 'Courier', possiblePersonal: false },
  { name: 'UPS', patterns: ['ups ', 'ups.com', 'ups store', 'united parcel'], category: CATEGORIES.SHIPPING, subcategory: 'Courier', possiblePersonal: false },
  { name: 'USPS', patterns: ['usps', 'united states postal', 'us postal', 'post office'], category: CATEGORIES.SHIPPING, subcategory: 'Postal', possiblePersonal: false },
  { name: 'DHL', patterns: ['dhl'], category: CATEGORIES.SHIPPING, subcategory: 'Courier', possiblePersonal: false },
  { name: 'Stamps.com', patterns: ['stamps.com'], category: CATEGORIES.SHIPPING, subcategory: 'Postage', possiblePersonal: false },
  { name: 'Pitney Bowes', patterns: ['pitney bowes'], category: CATEGORIES.SHIPPING, subcategory: 'Postage Equipment', possiblePersonal: false },
  { name: 'ShipStation', patterns: ['shipstation'], category: CATEGORIES.SHIPPING, subcategory: 'Shipping Software', possiblePersonal: false },

  // ── Vehicle & Gas ────────────────────────────────────────────────────
  { name: 'Shell', patterns: ['shell oil', 'shell '], category: CATEGORIES.VEHICLE, subcategory: 'Gas', possiblePersonal: true },
  { name: 'Chevron', patterns: ['chevron'], category: CATEGORIES.VEHICLE, subcategory: 'Gas', possiblePersonal: true },
  { name: 'BP', patterns: ['bp ', 'bp*', 'british petroleum'], category: CATEGORIES.VEHICLE, subcategory: 'Gas', possiblePersonal: true },
  { name: 'ExxonMobil', patterns: ['exxon', 'mobil ', 'exxonmobil'], category: CATEGORIES.VEHICLE, subcategory: 'Gas', possiblePersonal: true },
  { name: 'Sunoco', patterns: ['sunoco'], category: CATEGORIES.VEHICLE, subcategory: 'Gas', possiblePersonal: true },
  { name: 'Valero', patterns: ['valero'], category: CATEGORIES.VEHICLE, subcategory: 'Gas', possiblePersonal: true },
  { name: 'Speedway', patterns: ['speedway'], category: CATEGORIES.VEHICLE, subcategory: 'Gas', possiblePersonal: true },
  { name: 'Wawa', patterns: ['wawa'], category: CATEGORIES.VEHICLE, subcategory: 'Gas', possiblePersonal: true },
  { name: "Buc-ee's", patterns: ["buc-ee", "bucee", "buc ee"], category: CATEGORIES.VEHICLE, subcategory: 'Gas', possiblePersonal: true },
  { name: 'QuikTrip', patterns: ['quiktrip', 'qt '], category: CATEGORIES.VEHICLE, subcategory: 'Gas', possiblePersonal: true },
  { name: 'Sheetz', patterns: ['sheetz'], category: CATEGORIES.VEHICLE, subcategory: 'Gas', possiblePersonal: true },
  { name: '7-Eleven', patterns: ['7-eleven', '7 eleven', '7eleven'], category: CATEGORIES.VEHICLE, subcategory: 'Gas', possiblePersonal: true },
  { name: 'Circle K', patterns: ['circle k'], category: CATEGORIES.VEHICLE, subcategory: 'Gas', possiblePersonal: true },
  { name: 'Tesla Supercharger', patterns: ['tesla supercharger', 'tesla energy', 'tesla inc'], category: CATEGORIES.VEHICLE, subcategory: 'EV Charging', possiblePersonal: true },
  { name: 'ChargePoint', patterns: ['chargepoint'], category: CATEGORIES.VEHICLE, subcategory: 'EV Charging', possiblePersonal: true },
  { name: 'Jiffy Lube', patterns: ['jiffy lube'], category: CATEGORIES.VEHICLE, subcategory: 'Maintenance', possiblePersonal: true },
  { name: 'Valvoline', patterns: ['valvoline'], category: CATEGORIES.VEHICLE, subcategory: 'Maintenance', possiblePersonal: true },
  { name: 'AutoZone', patterns: ['autozone'], category: CATEGORIES.VEHICLE, subcategory: 'Parts', possiblePersonal: true },
  { name: "O'Reilly Auto Parts", patterns: ["o'reilly", 'oreilly auto'], category: CATEGORIES.VEHICLE, subcategory: 'Parts', possiblePersonal: true },
  { name: 'Advance Auto Parts', patterns: ['advance auto'], category: CATEGORIES.VEHICLE, subcategory: 'Parts', possiblePersonal: true },
  { name: 'Discount Tire', patterns: ['discount tire'], category: CATEGORIES.VEHICLE, subcategory: 'Tires', possiblePersonal: true },

  // ── Education & Training ─────────────────────────────────────────────
  { name: 'Udemy', patterns: ['udemy'], category: CATEGORIES.EDUCATION, subcategory: 'Online Course', possiblePersonal: true },
  { name: 'Coursera', patterns: ['coursera'], category: CATEGORIES.EDUCATION, subcategory: 'Online Course', possiblePersonal: true },
  { name: 'LinkedIn Learning', patterns: ['linkedin learning', 'lynda.com'], category: CATEGORIES.EDUCATION, subcategory: 'Online Course', possiblePersonal: true },
  { name: 'Skillshare', patterns: ['skillshare'], category: CATEGORIES.EDUCATION, subcategory: 'Online Course', possiblePersonal: true },
  { name: 'Pluralsight', patterns: ['pluralsight'], category: CATEGORIES.EDUCATION, subcategory: 'Online Course', possiblePersonal: false },
  { name: 'O\'Reilly Media', patterns: ["o'reilly media", 'oreilly media', 'safari books'], category: CATEGORIES.EDUCATION, subcategory: 'Books/Media', possiblePersonal: false },
  { name: 'Amazon Books', patterns: ['amzn kindle', 'kindle'], category: CATEGORIES.EDUCATION, subcategory: 'Books', possiblePersonal: true },
  { name: 'Audible', patterns: ['audible'], category: CATEGORIES.EDUCATION, subcategory: 'Audiobooks', possiblePersonal: true },

  // ── Medical & Health ─────────────────────────────────────────────────
  { name: 'CVS', patterns: ['cvs'], category: CATEGORIES.MEDICAL, subcategory: 'Pharmacy', possiblePersonal: true },
  { name: 'Walgreens', patterns: ['walgreens', 'walgreen'], category: CATEGORIES.MEDICAL, subcategory: 'Pharmacy', possiblePersonal: true },
  { name: 'Rite Aid', patterns: ['rite aid'], category: CATEGORIES.MEDICAL, subcategory: 'Pharmacy', possiblePersonal: true },
  { name: 'Blue Cross', patterns: ['blue cross', 'bcbs', 'anthem'], category: CATEGORIES.MEDICAL, subcategory: 'Health Insurance', possiblePersonal: true },
  { name: 'UnitedHealthcare', patterns: ['unitedhealth', 'uhc', 'united health'], category: CATEGORIES.MEDICAL, subcategory: 'Health Insurance', possiblePersonal: true },
  { name: 'Aetna', patterns: ['aetna'], category: CATEGORIES.MEDICAL, subcategory: 'Health Insurance', possiblePersonal: true },
  { name: 'Cigna', patterns: ['cigna'], category: CATEGORIES.MEDICAL, subcategory: 'Health Insurance', possiblePersonal: true },
  { name: 'Kaiser', patterns: ['kaiser'], category: CATEGORIES.MEDICAL, subcategory: 'Health Insurance', possiblePersonal: true },

  // ── Taxes & Government ───────────────────────────────────────────────
  { name: 'IRS', patterns: ['irs', 'internal revenue', 'eftps', 'us treasury'], category: CATEGORIES.TAXES, subcategory: 'Federal Tax', possiblePersonal: false },
  { name: 'State Tax', patterns: ['state tax', 'dept of revenue', 'franchise tax', 'tax commission'], category: CATEGORIES.TAXES, subcategory: 'State Tax', possiblePersonal: false },
  { name: 'Secretary of State', patterns: ['secretary of state', 'sos filing'], category: CATEGORIES.TAXES, subcategory: 'Filing Fee', possiblePersonal: false },
  { name: 'City License', patterns: ['city license', 'business license', 'city of'], category: CATEGORIES.TAXES, subcategory: 'License/Permit', possiblePersonal: false },

  // ── Possible-personal / Streaming / Gym ──────────────────────────────
  { name: 'Netflix', patterns: ['netflix'], category: CATEGORIES.SOFTWARE, subcategory: 'Streaming', possiblePersonal: true },
  { name: 'Spotify', patterns: ['spotify'], category: CATEGORIES.SOFTWARE, subcategory: 'Streaming', possiblePersonal: true },
  { name: 'Hulu', patterns: ['hulu'], category: CATEGORIES.SOFTWARE, subcategory: 'Streaming', possiblePersonal: true },
  { name: 'Disney+', patterns: ['disney+', 'disneyplus', 'disney plus'], category: CATEGORIES.SOFTWARE, subcategory: 'Streaming', possiblePersonal: true },
  { name: 'Apple Music / TV', patterns: ['apple.com/bill', 'apple music', 'itunes'], category: CATEGORIES.SOFTWARE, subcategory: 'Streaming', possiblePersonal: true },
  { name: 'YouTube Premium', patterns: ['youtube', 'google *youtube'], category: CATEGORIES.SOFTWARE, subcategory: 'Streaming', possiblePersonal: true },
  { name: 'HBO Max', patterns: ['hbo max', 'hbo '], category: CATEGORIES.SOFTWARE, subcategory: 'Streaming', possiblePersonal: true },
  { name: 'Peacock', patterns: ['peacock'], category: CATEGORIES.SOFTWARE, subcategory: 'Streaming', possiblePersonal: true },
  { name: 'Planet Fitness', patterns: ['planet fitness'], category: CATEGORIES.MISCELLANEOUS, subcategory: 'Gym', possiblePersonal: true },
  { name: 'LA Fitness', patterns: ['la fitness'], category: CATEGORIES.MISCELLANEOUS, subcategory: 'Gym', possiblePersonal: true },
  { name: 'Equinox', patterns: ['equinox'], category: CATEGORIES.MISCELLANEOUS, subcategory: 'Gym', possiblePersonal: true },
  { name: 'CrossFit', patterns: ['crossfit'], category: CATEGORIES.MISCELLANEOUS, subcategory: 'Gym', possiblePersonal: true },
  { name: 'YMCA', patterns: ['ymca'], category: CATEGORIES.MISCELLANEOUS, subcategory: 'Gym', possiblePersonal: true },
  { name: 'Peloton', patterns: ['peloton'], category: CATEGORIES.MISCELLANEOUS, subcategory: 'Fitness', possiblePersonal: true },

  // ── Grocery (almost always personal) ─────────────────────────────────
  { name: 'Walmart', patterns: ['walmart', 'wal-mart', 'wal mart'], category: CATEGORIES.MISCELLANEOUS, subcategory: 'Grocery/Retail', possiblePersonal: true },
  { name: 'Target', patterns: ['target'], category: CATEGORIES.MISCELLANEOUS, subcategory: 'Grocery/Retail', possiblePersonal: true },
  { name: 'Kroger', patterns: ['kroger'], category: CATEGORIES.MISCELLANEOUS, subcategory: 'Grocery', possiblePersonal: true },
  { name: 'Whole Foods', patterns: ['whole foods', 'wholefds'], category: CATEGORIES.MISCELLANEOUS, subcategory: 'Grocery', possiblePersonal: true },
  { name: 'Trader Joes', patterns: ["trader joe's", 'trader joes', 'trader joe'], category: CATEGORIES.MISCELLANEOUS, subcategory: 'Grocery', possiblePersonal: true },
  { name: 'Safeway', patterns: ['safeway'], category: CATEGORIES.MISCELLANEOUS, subcategory: 'Grocery', possiblePersonal: true },
  { name: 'Publix', patterns: ['publix'], category: CATEGORIES.MISCELLANEOUS, subcategory: 'Grocery', possiblePersonal: true },
  { name: 'Aldi', patterns: ['aldi'], category: CATEGORIES.MISCELLANEOUS, subcategory: 'Grocery', possiblePersonal: true },
  { name: 'HEB', patterns: ['h-e-b', 'heb '], category: CATEGORIES.MISCELLANEOUS, subcategory: 'Grocery', possiblePersonal: true },
  { name: 'Wegmans', patterns: ['wegmans'], category: CATEGORIES.MISCELLANEOUS, subcategory: 'Grocery', possiblePersonal: true },

  // ── Client Entertainment ─────────────────────────────────────────────
  { name: 'Ticketmaster', patterns: ['ticketmaster'], category: CATEGORIES.CLIENT_ENTERTAINMENT, subcategory: 'Events', possiblePersonal: true },
  { name: 'StubHub', patterns: ['stubhub'], category: CATEGORIES.CLIENT_ENTERTAINMENT, subcategory: 'Events', possiblePersonal: true },
  { name: 'Eventbrite', patterns: ['eventbrite'], category: CATEGORIES.CLIENT_ENTERTAINMENT, subcategory: 'Events', possiblePersonal: false },
  { name: 'TopGolf', patterns: ['topgolf'], category: CATEGORIES.CLIENT_ENTERTAINMENT, subcategory: 'Entertainment', possiblePersonal: true },
  { name: 'Bowlero', patterns: ['bowlero'], category: CATEGORIES.CLIENT_ENTERTAINMENT, subcategory: 'Entertainment', possiblePersonal: true },
  { name: 'Golf Course', patterns: ['golf course', 'golf club', 'country club'], category: CATEGORIES.CLIENT_ENTERTAINMENT, subcategory: 'Golf', possiblePersonal: true },
]

// ─── DESCRIPTION CLEANING ─────────────────────────────────────────────────
// Bank statements contain a lot of noise. This function strips it to reveal
// the actual vendor/payee name.

const NOISE_PATTERNS: RegExp[] = [
  // Card transaction prefixes
  /^(purchase authorized on \d{2}\/\d{2})\s*/i,
  /^(purchase )(authorized )?on\s*/i,
  /^debit card purchase\s*/i,
  /^debit card\s*/i,
  /^visa debit\s*/i,
  /^mastercard\s*/i,
  /^check card\s*/i,
  /^pos (debit|purchase|transaction)\s*/i,
  /^pos\s+/i,
  /^point of sale\s*/i,
  /^recurring payment\s*/i,
  /^recurring\s+/i,
  /^ach (debit|credit|payment|withdrawal|deposit)\s*/i,
  /^ach\s+/i,
  /^electronic (payment|withdrawal|deposit|debit|credit)\s*/i,
  /^online (payment|transfer|banking)\s*/i,
  /^bill payment\s*/i,
  /^autopay\s*/i,
  /^auto-?pay\s*/i,
  /^pre-?authorized\s*/i,
  /^pending\s*/i,
  /^external (withdrawal|deposit|transfer)\s*/i,

  // Trailing noise
  /\s+card \d{4}$/i,
  /\s+\*{4}\d{4}$/i,
  /\s+x{4}\d{4}$/i,
  /\s+ending in \d{4}$/i,
  /\s+\d{2}\/\d{2}$/,                        // trailing date MM/DD
  /\s+\d{2}\/\d{2}\/\d{2,4}$/,               // trailing date MM/DD/YY or MM/DD/YYYY
  /\s+\d{6,}$/,                               // trailing long numbers (transaction IDs)
  /\s+ref #?\s*\d+$/i,
  /\s+confirmation #?\s*\d+$/i,
  /\s+auth(orization)? #?\s*\w+$/i,
  /\s+trace #?\s*\d+$/i,
  /\s+seq #?\s*\d+$/i,

  // Middle noise
  /\s{2,}/g,                                  // collapse multiple spaces
]

// Additional patterns to strip (applied after main noise removal)
const SECONDARY_CLEAN: RegExp[] = [
  /\b\d{2}\/\d{2}\b/g,                       // embedded dates
  /\b\d{10,}\b/g,                             // long numbers in the middle
  /\b(xxxx|x{4})\d{4}\b/gi,                  // masked card numbers
  /\b\d{4}\*+\d{4}\b/g,                      // masked card 1234****5678
  /\s+#\d+\s*/g,                              // reference #12345
  /\s+-\s+/g,                                 // orphaned dashes
]

export function cleanDescription(raw: string): string {
  let cleaned = raw.trim()

  // Apply primary noise removal
  for (const pattern of NOISE_PATTERNS) {
    cleaned = cleaned.replace(pattern, ' ')
  }

  // Apply secondary cleanup
  for (const pattern of SECONDARY_CLEAN) {
    cleaned = cleaned.replace(pattern, ' ')
  }

  // Final cleanup
  cleaned = cleaned
    .replace(/\s{2,}/g, ' ')   // collapse spaces again
    .replace(/^\s*[-*#]+\s*/, '')  // leading special chars
    .replace(/\s*[-*#]+\s*$/, '')  // trailing special chars
    .trim()

  return cleaned || raw.trim()
}

// ─── VENDOR MATCHING ──────────────────────────────────────────────────────

interface VendorMatch {
  vendor: VendorEntry
  confidence: 'high' | 'medium' | 'low'
}

function matchVendor(cleanedDesc: string): VendorMatch | null {
  const lower = cleanedDesc.toLowerCase()

  // Pass 1: exact substring match (high confidence)
  for (const vendor of VENDOR_DATABASE) {
    for (const pattern of vendor.patterns) {
      if (lower === pattern || lower.startsWith(pattern) || lower.includes(` ${pattern}`)) {
        return { vendor, confidence: 'high' }
      }
    }
  }

  // Pass 2: substring anywhere (medium confidence)
  for (const vendor of VENDOR_DATABASE) {
    for (const pattern of vendor.patterns) {
      if (pattern.length >= 4 && lower.includes(pattern)) {
        return { vendor, confidence: 'medium' }
      }
    }
  }

  // Pass 3: fuzzy match — check if description words share significant overlap
  // with vendor patterns (low confidence)
  const descWords = lower.split(/\s+/).filter(w => w.length >= 3)
  for (const vendor of VENDOR_DATABASE) {
    for (const pattern of vendor.patterns) {
      const patternWords = pattern.split(/\s+/).filter(w => w.length >= 3)
      if (patternWords.length === 0) continue
      const matchedWords = patternWords.filter(pw =>
        descWords.some(dw => dw.includes(pw) || pw.includes(dw))
      )
      if (matchedWords.length > 0 && matchedWords.length >= patternWords.length * 0.6) {
        return { vendor, confidence: 'low' }
      }
    }
  }

  return null
}

// ─── KEYWORD-BASED FALLBACK CATEGORIZATION ────────────────────────────────
// When no vendor matches, try to categorize by keywords in the description.

const KEYWORD_RULES: Array<{
  keywords: string[]
  category: CategoryValue
  subcategory: string
}> = [
  { keywords: ['airline', 'airways', 'flight'], category: CATEGORIES.TRAVEL, subcategory: 'Airfare' },
  { keywords: ['hotel', 'motel', 'inn ', 'lodge', 'resort'], category: CATEGORIES.TRAVEL, subcategory: 'Hotel' },
  { keywords: ['rental car', 'car rental'], category: CATEGORIES.TRAVEL, subcategory: 'Car Rental' },
  { keywords: ['taxi', 'cab '], category: CATEGORIES.TRAVEL, subcategory: 'Taxi' },
  { keywords: ['gas station', 'fuel', 'petroleum', 'gasoline'], category: CATEGORIES.VEHICLE, subcategory: 'Gas' },
  { keywords: ['restaurant', 'cafe', 'bistro', 'grill', 'diner', 'kitchen', 'eatery', 'pizzeria', 'bakery', 'brewing', 'brewery', 'tavern', 'pub ', 'bar & grill'], category: CATEGORIES.MEALS, subcategory: 'Restaurant' },
  { keywords: ['coffee', 'espresso'], category: CATEGORIES.MEALS, subcategory: 'Coffee' },
  { keywords: ['insurance', 'ins co', 'ins inc'], category: CATEGORIES.INSURANCE, subcategory: 'Insurance' },
  { keywords: ['law office', 'law firm', 'attorney', 'lawyer', 'legal'], category: CATEGORIES.PROFESSIONAL, subcategory: 'Legal' },
  { keywords: ['cpa', 'accounting', 'tax prep', 'bookkeep'], category: CATEGORIES.PROFESSIONAL, subcategory: 'Accounting' },
  { keywords: ['consulting', 'consultant'], category: CATEGORIES.PROFESSIONAL, subcategory: 'Consulting' },
  { keywords: ['print', 'printing', 'copies'], category: CATEGORIES.MARKETING, subcategory: 'Printing' },
  { keywords: ['fedex', 'ups store', 'usps', 'post office', 'shipping', 'postage'], category: CATEGORIES.SHIPPING, subcategory: 'Shipping' },
  { keywords: ['electric', 'power', 'energy'], category: CATEGORIES.UTILITIES, subcategory: 'Electric' },
  { keywords: ['telecom', 'wireless', 'mobile', 'cellular', 'phone'], category: CATEGORIES.UTILITIES, subcategory: 'Telecom' },
  { keywords: ['internet', 'broadband', 'cable', 'fiber'], category: CATEGORIES.UTILITIES, subcategory: 'Internet' },
  { keywords: ['rent ', 'lease ', 'landlord'], category: CATEGORIES.RENT, subcategory: 'Rent', },
  { keywords: ['payroll', 'salary', 'wages'], category: CATEGORIES.PAYROLL, subcategory: 'Payroll' },
  { keywords: ['tax ', 'irs', 'dept of revenue'], category: CATEGORIES.TAXES, subcategory: 'Tax Payment' },
  { keywords: ['bank fee', 'service charge', 'monthly fee', 'overdraft'], category: CATEGORIES.BANKING, subcategory: 'Bank Fee' },
  { keywords: ['pharmacy', 'medical', 'health', 'doctor', 'dental', 'hospital', 'clinic', 'urgent care'], category: CATEGORIES.MEDICAL, subcategory: 'Medical', },
  { keywords: ['gym ', 'fitness', 'yoga', 'crossfit'], category: CATEGORIES.MISCELLANEOUS, subcategory: 'Gym' },
  { keywords: ['grocery', 'supermarket', 'food store', 'market'], category: CATEGORIES.MISCELLANEOUS, subcategory: 'Grocery' },
]

function keywordCategorize(cleanedDesc: string): { category: CategoryValue; subcategory: string; confidence: 'low' | 'medium' } | null {
  const lower = cleanedDesc.toLowerCase()
  for (const rule of KEYWORD_RULES) {
    for (const keyword of rule.keywords) {
      if (lower.includes(keyword)) {
        return { category: rule.category, subcategory: rule.subcategory, confidence: 'low' }
      }
    }
  }
  return null
}

// ─── FLAG LOGIC ───────────────────────────────────────────────────────────

function computeFlags(
  amount: number,
  date: string,
  possiblePersonal: boolean,
): string[] {
  const flags: string[] = []

  if (possiblePersonal) {
    flags.push('possible-personal')
  }

  const absAmount = Math.abs(amount)
  if (absAmount > 500) {
    flags.push('over-$500')
  }
  if (absAmount > 75) {
    flags.push('needs-receipt')
  }

  // Round number check (whole hundreds)
  if (absAmount >= 100 && absAmount % 100 === 0) {
    flags.push('round-number')
  }

  // Weekend check
  try {
    const d = new Date(date)
    if (!isNaN(d.getTime())) {
      const day = d.getDay()
      if (day === 0 || day === 6) {
        flags.push('weekend-transaction')
      }
    }
  } catch {
    // If date parsing fails, skip weekend check
  }

  return flags
}

// ─── MAIN CATEGORIZATION FUNCTION ─────────────────────────────────────────

export function categorizeTransactions(
  transactions: Array<{ description: string; amount: number; date: string }>,
): CategorizationReport {
  const categorized: CategorizedTransaction[] = transactions.map(txn => {
    const cleaned = cleanDescription(txn.description)
    const vendorMatch = matchVendor(cleaned)

    let category: CategoryValue
    let subcategory: string
    let confidence: 'high' | 'medium' | 'low'
    let matchedVendor: string | null
    let possiblePersonal: boolean

    if (vendorMatch) {
      category = vendorMatch.vendor.category
      subcategory = vendorMatch.vendor.subcategory
      confidence = vendorMatch.confidence
      matchedVendor = vendorMatch.vendor.name
      possiblePersonal = vendorMatch.vendor.possiblePersonal
    } else {
      const keywordResult = keywordCategorize(cleaned)
      if (keywordResult) {
        category = keywordResult.category
        subcategory = keywordResult.subcategory
        confidence = keywordResult.confidence
      } else {
        category = CATEGORIES.MISCELLANEOUS
        subcategory = 'Uncategorized'
        confidence = 'low'
      }
      matchedVendor = null
      possiblePersonal = false
    }

    const taxDeductible = !NON_DEDUCTIBLE_CATEGORIES.has(category)
    const deductionCategory = taxDeductible ? (IRS_DEDUCTION_MAP[category] ?? null) : null
    const flags = computeFlags(txn.amount, txn.date, possiblePersonal)

    return {
      originalDescription: txn.description,
      cleanedDescription: cleaned,
      category,
      subcategory,
      confidence,
      matchedVendor,
      taxDeductible,
      deductionCategory,
      flags,
    }
  })

  // Build summary
  const highConfidence = categorized.filter(t => t.confidence === 'high').length
  const mediumConfidence = categorized.filter(t => t.confidence === 'medium').length
  const lowConfidence = categorized.filter(t => t.confidence === 'low').length

  const deductibleTxns = categorized
    .map((t, i) => ({ ...t, amount: transactions[i].amount }))
    .filter(t => t.taxDeductible)

  const totalDeductible = deductibleTxns.length
  const deductibleAmount = deductibleTxns.reduce((sum, t) => sum + Math.abs(t.amount), 0)

  const flaggedCount = categorized.filter(t => t.flags.length > 0).length

  // Category breakdown
  const breakdownMap = new Map<string, { count: number; total: number }>()
  categorized.forEach((t, i) => {
    const existing = breakdownMap.get(t.category)
    const amt = Math.abs(transactions[i].amount)
    if (existing) {
      existing.count++
      existing.total += amt
    } else {
      breakdownMap.set(t.category, { count: 1, total: amt })
    }
  })

  const categoryBreakdown = Array.from(breakdownMap.entries())
    .map(([category, { count, total }]) => ({
      category,
      count,
      total: Math.round(total * 100) / 100,
    }))
    .sort((a, b) => b.total - a.total)

  return {
    transactions: categorized,
    summary: {
      totalCategorized: categorized.length,
      highConfidence,
      mediumConfidence,
      lowConfidence,
      totalDeductible,
      deductibleAmount: Math.round(deductibleAmount * 100) / 100,
      flaggedCount,
      categoryBreakdown,
    },
  }
}
