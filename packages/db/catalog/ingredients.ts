/**
 * Active ingredients the shared catalog is built around: widely used essential medicines across
 * the main therapeutic areas (names are WHO INNs; regional names are resolved automatically).
 * Adding a name here and re-running `pnpm catalog:build` pulls its products from every source.
 */
export const TARGET_INGREDIENTS: string[] = [
  // Pain, fever, inflammation
  'paracetamol', 'ibuprofen', 'diclofenac', 'naproxen', 'acetylsalicylic acid', 'celecoxib', 'tramadol',
  // Antibacterials
  'amoxicillin', 'azithromycin', 'clarithromycin', 'ciprofloxacin', 'levofloxacin', 'doxycycline',
  'cefalexin', 'cefuroxime', 'cefixime', 'metronidazole', 'nitrofurantoin', 'sulfamethoxazole', 'clindamycin',
  // Antifungals, antivirals, antiparasitics
  'fluconazole', 'aciclovir', 'valaciclovir', 'oseltamivir', 'albendazole', 'ivermectin', 'terbinafine', 'clotrimazole',
  // Diabetes
  'metformin', 'glimepiride', 'gliclazide', 'glipizide', 'sitagliptin', 'pioglitazone', 'empagliflozin', 'dapagliflozin',
  // Cardiovascular
  'atorvastatin', 'rosuvastatin', 'simvastatin', 'amlodipine', 'losartan', 'telmisartan', 'valsartan', 'olmesartan',
  'ramipril', 'enalapril', 'lisinopril', 'metoprolol', 'atenolol', 'bisoprolol', 'carvedilol', 'propranolol',
  'hydrochlorothiazide', 'chlortalidone', 'furosemide', 'spironolactone', 'clopidogrel', 'warfarin', 'apixaban',
  'rivaroxaban', 'digoxin', 'isosorbide mononitrate', 'nifedipine',
  // Gastrointestinal
  'omeprazole', 'pantoprazole', 'esomeprazole', 'rabeprazole', 'lansoprazole', 'famotidine', 'ondansetron',
  'domperidone', 'metoclopramide', 'loperamide',
  // Allergy and respiratory
  'cetirizine', 'levocetirizine', 'loratadine', 'desloratadine', 'fexofenadine', 'montelukast', 'salbutamol',
  'budesonide', 'fluticasone propionate', 'ipratropium',
  // Corticosteroids and thyroid
  'prednisolone', 'prednisone', 'dexamethasone', 'methylprednisolone', 'hydrocortisone', 'levothyroxine',
  // Nervous system
  'sertraline', 'fluoxetine', 'escitalopram', 'citalopram', 'paroxetine', 'amitriptyline', 'duloxetine',
  'venlafaxine', 'alprazolam', 'clonazepam', 'diazepam', 'lorazepam', 'zolpidem', 'quetiapine', 'olanzapine',
  'risperidone', 'aripiprazole', 'levetiracetam', 'valproic acid', 'carbamazepine', 'phenytoin', 'lamotrigine',
  'gabapentin', 'pregabalin',
  // Urology
  'tamsulosin', 'finasteride', 'sildenafil', 'tadalafil',
  // Gout and rheumatology
  'allopurinol', 'colchicine', 'methotrexate', 'hydroxychloroquine',
  // Vitamins and minerals
  'folic acid', 'cyanocobalamin', 'colecalciferol', 'ferrous sulfate', 'calcium carbonate',
  // Skin and eye
  'mupirocin', 'ketoconazole', 'timolol', 'latanoprost',
]

/**
 * Labelers that mostly repackage other companies' products. They are not excluded (the data is
 * still correct), only ranked last so the snapshot favours the companies that make the product.
 */
export const REPACKAGER_HINTS = [
  'repack', 'bryant ranch', 'nucare', 'proficient rx', 'quality care', 'a-s medication', 'direct_rx', 'direct rx',
  'preferred pharmaceuticals', 'pd-rx', 'aphena', 'lake erie', 'st. mary', 'henry schein', 'asclemed', 'medsource',
  'unit dose services', 'american health packaging', 'cardinal health', 'major pharmaceuticals', 'denton',
  'northwind', 'advanced rx', 'coupler', 'golden state medical', 'rebel distributors', 'safecor', 'chartwell',
  'aidarex', 'blenheim', 'contract pharmacy', 'liberty pharmaceuticals', 'med-health', 'h.j. harkins', 'lifestar',
  'stat rx', 'readymeds', 'altura', 'clinical solutions wholesale', 'keltman', 'dispensing solutions', 'medvantx',
]
