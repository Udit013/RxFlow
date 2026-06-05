/**
 * Meilisearch Integration
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides fast, typo-tolerant full-text search over the medicine catalog.
 *
 * Index: "medicines"
 * Searchable attributes: name, genericName, brandName, aliases, manufacturerName, searchTokens
 * Filterable attributes: dosageForm, schedule, requiresPrescription, gstRate
 * Sortable attributes: mrp, name
 */

export const MEILISEARCH_INDEX = 'medicines'

export const MEDICINES_INDEX_SETTINGS = {
  searchableAttributes: [
    'name',
    'genericName',
    'brandName',
    'aliases',
    'manufacturerName',
    'searchTokens',
    'compositions.ingredient',
  ],
  filterableAttributes: [
    'dosageForm',
    'schedule',
    'requiresPrescription',
    'gstRate',
    'isActive',
    'isVerified',
  ],
  sortableAttributes: ['mrp', 'name', 'genericName'],
  rankingRules: [
    'words',
    'typo',
    'proximity',
    'attribute',
    'sort',
    'exactness',
  ],
  typoTolerance: {
    enabled: true,
    minWordSizeForTypos: {
      oneTypo: 5,
      twoTypos: 9,
    },
  },
  synonyms: {
    // Common pharma synonyms
    paracetamol: ['acetaminophen', 'pcm', 'para'],
    ibuprofen: ['brufen', 'advil'],
    amoxicillin: ['amoxil', 'mox'],
    azithromycin: ['zithromax', 'azee'],
    metformin: ['glucophage', 'glycomet'],
    atorvastatin: ['lipitor', 'atorfit'],
    pantoprazole: ['pantop', 'pantocid', 'pan'],
    omeprazole: ['omez', 'prilosec'],
    salbutamol: ['albuterol', 'ventolin', 'asthalin'],
    cetirizine: ['cetzine', 'zyrtec'],
    domperidone: ['domstal', 'vomistop'],
    ondansetron: ['ondem', 'zofran'],
    doxycycline: ['doxt', 'biodoxi'],
    ciprofloxacin: ['ciprobid', 'ciplox'],
  },
  stopWords: ['tablet', 'capsule', 'mg', 'ml', 'of', 'the', 'for'],
}

export interface MeilisearchMedicineDocument {
  id: string
  name: string
  genericName: string
  brandName: string
  manufacturerName: string
  dosageForm: string
  strength: string
  packSize: string
  mrp: number
  gstRate: number
  hsn: string
  schedule: string
  requiresPrescription: boolean
  aliases: string[]
  barcodes: string[]
  searchTokens: string[]
  isActive: boolean
  isVerified: boolean
  compositions: { ingredient: string; strength: string; unit: string }[]
}

/**
 * Initialize Meilisearch index with correct settings.
 * Call this once on app startup.
 */
export async function setupMeilisearchIndex(host: string, apiKey: string) {
  const { MeiliSearch } = await import('meilisearch').catch(() => {
    throw new Error('Install meilisearch package: pnpm add meilisearch')
  })

  const client = new MeiliSearch({ host, apiKey })

  try {
    await client.createIndex(MEILISEARCH_INDEX, { primaryKey: 'id' })
  } catch {
    // Index already exists — fine
  }

  const index = client.index(MEILISEARCH_INDEX)
  await index.updateSettings(MEDICINES_INDEX_SETTINGS as Parameters<typeof index.updateSettings>[0])

  return { client, index }
}

/**
 * Index medicines into Meilisearch.
 * @param host Meilisearch host
 * @param apiKey Meilisearch API key
 * @param medicines Array of medicine documents
 */
export async function indexMedicines(
  host: string,
  apiKey: string,
  medicines: MeilisearchMedicineDocument[]
) {
  const { MeiliSearch } = await import('meilisearch')
  const client = new MeiliSearch({ host, apiKey })
  const index = client.index(MEILISEARCH_INDEX)

  // Batch index in chunks of 1000
  const CHUNK_SIZE = 1000
  for (let i = 0; i < medicines.length; i += CHUNK_SIZE) {
    const chunk = medicines.slice(i, i + CHUNK_SIZE)
    await index.addDocuments(chunk)
  }
}

/**
 * Search medicines in Meilisearch.
 */
export async function searchMeilisearch(
  host: string,
  apiKey: string,
  query: string,
  options?: {
    limit?: number
    offset?: number
    filter?: string
    sort?: string[]
  }
) {
  const { MeiliSearch } = await import('meilisearch')
  const client = new MeiliSearch({ host, apiKey })
  const index = client.index(MEILISEARCH_INDEX)

  return index.search(query, {
    limit: options?.limit ?? 20,
    offset: options?.offset ?? 0,
    filter: options?.filter,
    sort: options?.sort,
    attributesToHighlight: ['name', 'genericName', 'brandName'],
    highlightPreTag: '<mark>',
    highlightPostTag: '</mark>',
  })
}
