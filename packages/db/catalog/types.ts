import type { Ingredient } from '@rxflow/types'

export type ScheduleCode = 'OTC' | 'SCHEDULE_G' | 'SCHEDULE_H' | 'SCHEDULE_H1' | 'SCHEDULE_X'

/** One product in a catalog snapshot (catalog/snapshot/*.json). */
export interface SnapshotMedicine {
  source: 'OPENFDA_NDC' | 'HC_DPD' | 'JAN_AUSHADHI'
  sourceRef: string
  sourceUrl: string
  retrievedAt: string
  country: string
  name: string
  brandName: string
  genericName: string
  manufacturerName: string
  dosageForm: string
  dosageFormDetail: string | null
  route: string | null
  strength: string
  ingredients: Ingredient[]
  ingredientKey: string
  compositionKey: string | null
  packSize: string | null
  /** National product code: NDC (US), DIN (Canada). Stored in Medicine.hsn ("product code"). */
  productCode: string
  schedule: ScheduleCode
  category: string | null
  atcCode: string | null
  therapeuticClass?: string | null
  aliases: string[]
  barcodes: string[]
  /** Official retail price where the source publishes one (Jan Aushadhi MRP, INR). */
  mrp?: number
  gstRate?: number
  /** Every ingredient resolves in NLM RxNorm and every strength parsed. */
  verified: boolean
}

export interface SnapshotClass {
  ingredientKey: string
  atcCode: string
  className: string | null
  source: string
}

export interface SourceInfo {
  id: string
  name: string
  publisher: string
  country: string | null
  url: string
  license: string
  licenseUrl: string | null
  attribution: string
  notes: string | null
}

export const SOURCES: SourceInfo[] = [
  {
    id: 'OPENFDA_NDC',
    name: 'National Drug Code Directory (via openFDA)',
    publisher: 'U.S. Food and Drug Administration',
    country: 'US',
    url: 'https://open.fda.gov/apis/drug/ndc/',
    license: 'Public domain (CC0 1.0)',
    licenseUrl: 'https://open.fda.gov/license/',
    attribution: 'Product data from the U.S. FDA National Drug Code Directory via openFDA.',
    notes: 'Listing in the NDC Directory does not denote FDA approval. No prices are published.',
  },
  {
    id: 'HC_DPD',
    name: 'Drug Product Database',
    publisher: 'Health Canada',
    country: 'CA',
    url: 'https://www.canada.ca/en/health-canada/services/drugs-health-products/drug-products/drug-product-database.html',
    license: 'Open Government Licence – Canada',
    licenseUrl: 'https://open.canada.ca/en/open-government-licence-canada',
    attribution: 'Contains information licensed under the Open Government Licence – Canada (Health Canada Drug Product Database).',
    notes: 'Marketed human products only. ATC codes from this database classify ingredients for every market.',
  },
  {
    id: 'NLM_RXNAV',
    name: 'RxNorm and RxClass (RxNav APIs)',
    publisher: 'U.S. National Library of Medicine',
    country: null,
    url: 'https://lhncbc.nlm.nih.gov/RxNav/',
    license: 'Free to use; see NLM terms',
    licenseUrl: 'https://lhncbc.nlm.nih.gov/RxNav/TermsofService.html',
    attribution: 'This product uses publicly available data from the U.S. National Library of Medicine (NLM), National Institutes of Health; NLM is not responsible for the product and does not endorse or recommend it.',
    notes: 'Used to verify ingredient names and to name ATC level-4 groups (ATC classification © WHO Collaborating Centre for Drug Statistics Methodology).',
  },
  {
    id: 'JAN_AUSHADHI',
    name: 'Jan Aushadhi Product & MRP List (PMBJP)',
    publisher: 'Pharmaceuticals & Medical Devices Bureau of India, Department of Pharmaceuticals, Government of India',
    country: 'IN',
    url: 'https://janaushadhi.gov.in/product-portfolio/product-mrp-list',
    license: 'Published publicly by the Government of India; no separate open-data licence stated',
    licenseUrl: null,
    attribution: 'Product names, pack sizes, MRPs and therapeutic groups from the PMBJP Product & MRP List published by PMBI.',
    notes: 'Generic medicines sold at Jan Aushadhi Kendras, with official MRPs. The list does not state drug schedules: anything outside vitamins, antiseptics and similar groups defaults to Schedule H (prescription) — confirm against the label. GST defaults to 5% (the rate for most medicines from 22 Sep 2025; some life-saving drugs are nil). Products without a published MRP and non-medicines are left out.',
  },
]
