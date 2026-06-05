// Common Indian pharmacy medicines — realistic seed data for demos.
// MRP values are approximate market rates; HSN 30049099 = drug pharma default.

export interface SeedMedicine {
  name: string
  genericName: string
  brandName: string
  manufacturerName: string
  dosageForm: 'TABLET' | 'CAPSULE' | 'SYRUP' | 'INJECTION' | 'CREAM' | 'OINTMENT' | 'DROPS' | 'INHALER' | 'POWDER' | 'SUSPENSION' | 'GEL' | 'SPRAY' | 'OTHER'
  strength: string
  packSize: string
  packUnit?: string
  mrp: number
  hsn: string
  gstRate?: number
  schedule?: 'OTC' | 'SCHEDULE_H' | 'SCHEDULE_H1' | 'SCHEDULE_X' | 'SCHEDULE_G'
  requiresPrescription?: boolean
}

export const SAMPLE_MEDICINES: SeedMedicine[] = [
  // Analgesics & antipyretics
  { name: 'Dolo 650', genericName: 'Paracetamol', brandName: 'Dolo', manufacturerName: 'Micro Labs', dosageForm: 'TABLET', strength: '650mg', packSize: '15 tablets', mrp: 33.5, hsn: '30049099', gstRate: 12 },
  { name: 'Crocin Advance', genericName: 'Paracetamol', brandName: 'Crocin', manufacturerName: 'GSK', dosageForm: 'TABLET', strength: '500mg', packSize: '15 tablets', mrp: 30, hsn: '30049099', gstRate: 12 },
  { name: 'Calpol 500', genericName: 'Paracetamol', brandName: 'Calpol', manufacturerName: 'GSK', dosageForm: 'TABLET', strength: '500mg', packSize: '15 tablets', mrp: 25, hsn: '30049099', gstRate: 12 },
  { name: 'Combiflam', genericName: 'Ibuprofen + Paracetamol', brandName: 'Combiflam', manufacturerName: 'Sanofi', dosageForm: 'TABLET', strength: '400mg + 325mg', packSize: '20 tablets', mrp: 55, hsn: '30049099', gstRate: 12 },
  { name: 'Saridon', genericName: 'Paracetamol + Caffeine + Propyphenazone', brandName: 'Saridon', manufacturerName: 'Bayer', dosageForm: 'TABLET', strength: '250mg + 30mg + 150mg', packSize: '10 tablets', mrp: 38, hsn: '30049099', gstRate: 12 },
  { name: 'Brufen 400', genericName: 'Ibuprofen', brandName: 'Brufen', manufacturerName: 'Abbott', dosageForm: 'TABLET', strength: '400mg', packSize: '15 tablets', mrp: 42, hsn: '30049099', gstRate: 12 },
  { name: 'Voveran SR 100', genericName: 'Diclofenac Sodium', brandName: 'Voveran', manufacturerName: 'Novartis', dosageForm: 'TABLET', strength: '100mg', packSize: '10 tablets', mrp: 58, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },
  { name: 'Disprin', genericName: 'Aspirin', brandName: 'Disprin', manufacturerName: 'Reckitt Benckiser', dosageForm: 'TABLET', strength: '350mg', packSize: '10 tablets', mrp: 18, hsn: '30049099', gstRate: 12 },

  // Antibiotics
  { name: 'Azithral 500', genericName: 'Azithromycin', brandName: 'Azithral', manufacturerName: 'Alembic', dosageForm: 'TABLET', strength: '500mg', packSize: '5 tablets', mrp: 88, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },
  { name: 'Augmentin 625', genericName: 'Amoxicillin + Clavulanic Acid', brandName: 'Augmentin', manufacturerName: 'GSK', dosageForm: 'TABLET', strength: '500mg + 125mg', packSize: '10 tablets', mrp: 195, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },
  { name: 'Amoxyclav 625', genericName: 'Amoxicillin + Clavulanic Acid', brandName: 'Amoxyclav', manufacturerName: 'Cipla', dosageForm: 'TABLET', strength: '500mg + 125mg', packSize: '10 tablets', mrp: 165, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },
  { name: 'Mox 500', genericName: 'Amoxicillin', brandName: 'Mox', manufacturerName: 'Sun Pharma', dosageForm: 'CAPSULE', strength: '500mg', packSize: '10 capsules', mrp: 75, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },
  { name: 'Cifran 500', genericName: 'Ciprofloxacin', brandName: 'Cifran', manufacturerName: 'Ranbaxy', dosageForm: 'TABLET', strength: '500mg', packSize: '10 tablets', mrp: 88, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },
  { name: 'Levoflox 500', genericName: 'Levofloxacin', brandName: 'Levoflox', manufacturerName: 'Cipla', dosageForm: 'TABLET', strength: '500mg', packSize: '10 tablets', mrp: 145, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },
  { name: 'Doxy 100', genericName: 'Doxycycline', brandName: 'Doxy', manufacturerName: 'USV', dosageForm: 'CAPSULE', strength: '100mg', packSize: '10 capsules', mrp: 38, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },
  { name: 'Metrogyl 400', genericName: 'Metronidazole', brandName: 'Metrogyl', manufacturerName: 'JB Chemicals', dosageForm: 'TABLET', strength: '400mg', packSize: '15 tablets', mrp: 38, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },

  // Acid reflux / antacids
  { name: 'Pantop 40', genericName: 'Pantoprazole', brandName: 'Pantop', manufacturerName: 'Aristo', dosageForm: 'TABLET', strength: '40mg', packSize: '15 tablets', mrp: 95, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },
  { name: 'Pan 40', genericName: 'Pantoprazole', brandName: 'Pan', manufacturerName: 'Alkem', dosageForm: 'TABLET', strength: '40mg', packSize: '15 tablets', mrp: 115, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },
  { name: 'Omez 20', genericName: 'Omeprazole', brandName: 'Omez', manufacturerName: 'Dr Reddy\'s', dosageForm: 'CAPSULE', strength: '20mg', packSize: '15 capsules', mrp: 55, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },
  { name: 'Razo 20', genericName: 'Rabeprazole', brandName: 'Razo', manufacturerName: 'Dr Reddy\'s', dosageForm: 'TABLET', strength: '20mg', packSize: '15 tablets', mrp: 110, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },
  { name: 'Digene', genericName: 'Magnesium Hydroxide + Aluminium Hydroxide + Simethicone', brandName: 'Digene', manufacturerName: 'Abbott', dosageForm: 'TABLET', strength: 'Multi', packSize: '15 tablets', mrp: 95, hsn: '30049099', gstRate: 12 },
  { name: 'Gelusil MPS', genericName: 'Magaldrate + Simethicone', brandName: 'Gelusil', manufacturerName: 'Pfizer', dosageForm: 'SYRUP', strength: '170ml', packSize: '170ml bottle', packUnit: 'ml', mrp: 165, hsn: '30049099', gstRate: 12 },

  // Cold / cough / allergy
  { name: 'Allegra 120', genericName: 'Fexofenadine', brandName: 'Allegra', manufacturerName: 'Sanofi', dosageForm: 'TABLET', strength: '120mg', packSize: '10 tablets', mrp: 195, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },
  { name: 'Cetzine 10', genericName: 'Cetirizine', brandName: 'Cetzine', manufacturerName: 'Dr Reddy\'s', dosageForm: 'TABLET', strength: '10mg', packSize: '10 tablets', mrp: 28, hsn: '30049099', gstRate: 12 },
  { name: 'Levocet 5', genericName: 'Levocetirizine', brandName: 'Levocet', manufacturerName: 'Dr Reddy\'s', dosageForm: 'TABLET', strength: '5mg', packSize: '10 tablets', mrp: 55, hsn: '30049099', gstRate: 12 },
  { name: 'Montair LC', genericName: 'Montelukast + Levocetirizine', brandName: 'Montair LC', manufacturerName: 'Cipla', dosageForm: 'TABLET', strength: '10mg + 5mg', packSize: '10 tablets', mrp: 165, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },
  { name: 'Sinarest', genericName: 'Paracetamol + Phenylephrine + Chlorpheniramine', brandName: 'Sinarest', manufacturerName: 'Centaur', dosageForm: 'TABLET', strength: '500mg + 10mg + 2mg', packSize: '10 tablets', mrp: 65, hsn: '30049099', gstRate: 12 },
  { name: 'D-Cold Total', genericName: 'Paracetamol + Phenylephrine + Caffeine', brandName: 'D-Cold', manufacturerName: 'Reckitt Benckiser', dosageForm: 'TABLET', strength: '500mg + 5mg + 30mg', packSize: '10 tablets', mrp: 38, hsn: '30049099', gstRate: 12 },
  { name: 'Benadryl', genericName: 'Diphenhydramine', brandName: 'Benadryl', manufacturerName: 'Johnson & Johnson', dosageForm: 'SYRUP', strength: '14.08mg/5ml', packSize: '150ml', packUnit: 'ml', mrp: 125, hsn: '30049099', gstRate: 12 },
  { name: 'Ascoril LS', genericName: 'Ambroxol + Levosalbutamol + Guaiphenesin', brandName: 'Ascoril', manufacturerName: 'Glenmark', dosageForm: 'SYRUP', strength: 'Multi', packSize: '100ml', packUnit: 'ml', mrp: 140, hsn: '30049099', gstRate: 12 },
  { name: 'Corex', genericName: 'Chlorpheniramine + Codeine', brandName: 'Corex', manufacturerName: 'Pfizer', dosageForm: 'SYRUP', strength: 'Multi', packSize: '100ml', packUnit: 'ml', mrp: 105, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H1', requiresPrescription: true },

  // Diabetes
  { name: 'Glycomet 500', genericName: 'Metformin', brandName: 'Glycomet', manufacturerName: 'USV', dosageForm: 'TABLET', strength: '500mg', packSize: '15 tablets', mrp: 28, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },
  { name: 'Glycomet GP1', genericName: 'Metformin + Glimepiride', brandName: 'Glycomet GP', manufacturerName: 'USV', dosageForm: 'TABLET', strength: '500mg + 1mg', packSize: '15 tablets', mrp: 95, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },
  { name: 'Amaryl 2', genericName: 'Glimepiride', brandName: 'Amaryl', manufacturerName: 'Sanofi', dosageForm: 'TABLET', strength: '2mg', packSize: '10 tablets', mrp: 125, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },
  { name: 'Janumet 50/500', genericName: 'Sitagliptin + Metformin', brandName: 'Janumet', manufacturerName: 'MSD', dosageForm: 'TABLET', strength: '50mg + 500mg', packSize: '15 tablets', mrp: 365, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },

  // BP / cardiac
  { name: 'Amlokind 5', genericName: 'Amlodipine', brandName: 'Amlokind', manufacturerName: 'Mankind', dosageForm: 'TABLET', strength: '5mg', packSize: '10 tablets', mrp: 18, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },
  { name: 'Telma 40', genericName: 'Telmisartan', brandName: 'Telma', manufacturerName: 'Glenmark', dosageForm: 'TABLET', strength: '40mg', packSize: '15 tablets', mrp: 165, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },
  { name: 'Telma H', genericName: 'Telmisartan + Hydrochlorothiazide', brandName: 'Telma H', manufacturerName: 'Glenmark', dosageForm: 'TABLET', strength: '40mg + 12.5mg', packSize: '15 tablets', mrp: 195, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },
  { name: 'Ecosprin 75', genericName: 'Aspirin', brandName: 'Ecosprin', manufacturerName: 'USV', dosageForm: 'TABLET', strength: '75mg', packSize: '14 tablets', mrp: 12, hsn: '30049099', gstRate: 12 },
  { name: 'Atorva 10', genericName: 'Atorvastatin', brandName: 'Atorva', manufacturerName: 'Zydus', dosageForm: 'TABLET', strength: '10mg', packSize: '15 tablets', mrp: 95, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },
  { name: 'Rosuvas 10', genericName: 'Rosuvastatin', brandName: 'Rosuvas', manufacturerName: 'Sun Pharma', dosageForm: 'TABLET', strength: '10mg', packSize: '10 tablets', mrp: 145, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },
  { name: 'Concor 5', genericName: 'Bisoprolol', brandName: 'Concor', manufacturerName: 'Merck', dosageForm: 'TABLET', strength: '5mg', packSize: '10 tablets', mrp: 135, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },

  // Antiemetics / GI
  { name: 'Domstal', genericName: 'Domperidone', brandName: 'Domstal', manufacturerName: 'Torrent', dosageForm: 'TABLET', strength: '10mg', packSize: '10 tablets', mrp: 28, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },
  { name: 'Emeset 4', genericName: 'Ondansetron', brandName: 'Emeset', manufacturerName: 'Cipla', dosageForm: 'TABLET', strength: '4mg', packSize: '10 tablets', mrp: 38, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },
  { name: 'Cyclopam', genericName: 'Dicyclomine + Paracetamol', brandName: 'Cyclopam', manufacturerName: 'Indoco', dosageForm: 'TABLET', strength: '20mg + 500mg', packSize: '10 tablets', mrp: 38, hsn: '30049099', gstRate: 12 },

  // Vitamins / supplements
  { name: 'Becosules', genericName: 'B-Complex with Vitamin C', brandName: 'Becosules', manufacturerName: 'Pfizer', dosageForm: 'CAPSULE', strength: 'Multi', packSize: '20 capsules', mrp: 65, hsn: '30049099', gstRate: 12 },
  { name: 'Shelcal 500', genericName: 'Calcium Carbonate + Vitamin D3', brandName: 'Shelcal', manufacturerName: 'Torrent', dosageForm: 'TABLET', strength: '500mg + 250 IU', packSize: '15 tablets', mrp: 145, hsn: '30049099', gstRate: 12 },
  { name: 'Calcimax', genericName: 'Calcium + Vitamin D3 + Magnesium + Zinc', brandName: 'Calcimax', manufacturerName: 'Meyer Organics', dosageForm: 'TABLET', strength: 'Multi', packSize: '15 tablets', mrp: 195, hsn: '30049099', gstRate: 12 },
  { name: 'Limcee', genericName: 'Vitamin C', brandName: 'Limcee', manufacturerName: 'Abbott', dosageForm: 'TABLET', strength: '500mg', packSize: '15 tablets', mrp: 25, hsn: '30049099', gstRate: 12 },
  { name: 'Zincovit', genericName: 'Multivitamin + Multimineral', brandName: 'Zincovit', manufacturerName: 'Apex Labs', dosageForm: 'TABLET', strength: 'Multi', packSize: '15 tablets', mrp: 125, hsn: '30049099', gstRate: 12 },
  { name: 'Neurobion Forte', genericName: 'B-Complex with B12', brandName: 'Neurobion', manufacturerName: 'Procter & Gamble', dosageForm: 'TABLET', strength: 'Multi', packSize: '30 tablets', mrp: 38, hsn: '30049099', gstRate: 12 },
  { name: 'Revital H', genericName: 'Multivitamin + Ginseng', brandName: 'Revital', manufacturerName: 'Ranbaxy', dosageForm: 'CAPSULE', strength: 'Multi', packSize: '30 capsules', mrp: 415, hsn: '30049099', gstRate: 18 },

  // Thyroid / hormones
  { name: 'Thyronorm 50', genericName: 'Levothyroxine', brandName: 'Thyronorm', manufacturerName: 'Abbott', dosageForm: 'TABLET', strength: '50mcg', packSize: '120 tablets', mrp: 138, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },
  { name: 'Eltroxin 100', genericName: 'Levothyroxine', brandName: 'Eltroxin', manufacturerName: 'GSK', dosageForm: 'TABLET', strength: '100mcg', packSize: '120 tablets', mrp: 155, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },

  // Diabetes / iron / supplements
  { name: 'Dexorange', genericName: 'Iron + B-Complex', brandName: 'Dexorange', manufacturerName: 'Franco-Indian', dosageForm: 'SYRUP', strength: 'Multi', packSize: '200ml', packUnit: 'ml', mrp: 165, hsn: '30049099', gstRate: 12 },
  { name: 'Livogen', genericName: 'Ferrous Fumarate + Folic Acid', brandName: 'Livogen', manufacturerName: 'Merck', dosageForm: 'TABLET', strength: '200mg + 0.5mg', packSize: '30 tablets', mrp: 88, hsn: '30049099', gstRate: 12 },

  // Skin / topical
  { name: 'Soframycin', genericName: 'Framycetin', brandName: 'Soframycin', manufacturerName: 'Sanofi', dosageForm: 'CREAM', strength: '1%', packSize: '30g', packUnit: 'g', mrp: 95, hsn: '30049099', gstRate: 12 },
  { name: 'Betadine', genericName: 'Povidone Iodine', brandName: 'Betadine', manufacturerName: 'Win-Medicare', dosageForm: 'OINTMENT', strength: '5%', packSize: '50g', packUnit: 'g', mrp: 110, hsn: '30049099', gstRate: 12 },
  { name: 'Volini Gel', genericName: 'Diclofenac + Linseed Oil + Methyl Salicylate + Menthol', brandName: 'Volini', manufacturerName: 'Sun Pharma', dosageForm: 'GEL', strength: 'Multi', packSize: '30g', packUnit: 'g', mrp: 165, hsn: '30049099', gstRate: 12 },
  { name: 'Moov Spray', genericName: 'Methyl Salicylate + Capsaicin + Camphor', brandName: 'Moov', manufacturerName: 'Reckitt Benckiser', dosageForm: 'SPRAY', strength: 'Multi', packSize: '35g', packUnit: 'g', mrp: 195, hsn: '30049099', gstRate: 12 },

  // Eye / ear / nose drops
  { name: 'Otrivin Adult', genericName: 'Xylometazoline', brandName: 'Otrivin', manufacturerName: 'GSK', dosageForm: 'DROPS', strength: '0.1%', packSize: '10ml', packUnit: 'ml', mrp: 105, hsn: '30049099', gstRate: 12 },
  { name: 'Visine', genericName: 'Tetrahydrozoline', brandName: 'Visine', manufacturerName: 'Johnson & Johnson', dosageForm: 'DROPS', strength: '0.05%', packSize: '15ml', packUnit: 'ml', mrp: 95, hsn: '30049099', gstRate: 12 },
  { name: 'Refresh Tears', genericName: 'Carboxymethylcellulose', brandName: 'Refresh Tears', manufacturerName: 'Allergan', dosageForm: 'DROPS', strength: '0.5%', packSize: '10ml', packUnit: 'ml', mrp: 165, hsn: '30049099', gstRate: 12 },

  // Asthma / respiratory
  { name: 'Asthalin Inhaler', genericName: 'Salbutamol', brandName: 'Asthalin', manufacturerName: 'Cipla', dosageForm: 'INHALER', strength: '100mcg', packSize: '200 doses', mrp: 145, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },
  { name: 'Foracort 200', genericName: 'Formoterol + Budesonide', brandName: 'Foracort', manufacturerName: 'Cipla', dosageForm: 'INHALER', strength: '6mcg + 200mcg', packSize: '120 doses', mrp: 415, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },

  // ORS / hydration
  { name: 'Electral', genericName: 'Oral Rehydration Salts', brandName: 'Electral', manufacturerName: 'FDC', dosageForm: 'POWDER', strength: '21.8g', packSize: '21.8g sachet', packUnit: 'sachets', mrp: 22, hsn: '30049099', gstRate: 12 },
  { name: 'Enerzal Orange', genericName: 'Electrolyte Powder', brandName: 'Enerzal', manufacturerName: 'FDC', dosageForm: 'POWDER', strength: '50g', packSize: '50g', packUnit: 'g', mrp: 25, hsn: '30049099', gstRate: 18 },

  // Mental health / sleep
  { name: 'Stalopam 10', genericName: 'Escitalopram', brandName: 'Stalopam', manufacturerName: 'Lupin', dosageForm: 'TABLET', strength: '10mg', packSize: '10 tablets', mrp: 145, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },
  { name: 'Restyl 0.5', genericName: 'Alprazolam', brandName: 'Restyl', manufacturerName: 'Sun Pharma', dosageForm: 'TABLET', strength: '0.5mg', packSize: '15 tablets', mrp: 38, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H1', requiresPrescription: true },

  // Pain / muscle
  { name: 'Zerodol SP', genericName: 'Aceclofenac + Paracetamol + Serratiopeptidase', brandName: 'Zerodol SP', manufacturerName: 'IPCA', dosageForm: 'TABLET', strength: '100mg + 325mg + 15mg', packSize: '10 tablets', mrp: 145, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },
  { name: 'Dolonex 20', genericName: 'Piroxicam', brandName: 'Dolonex', manufacturerName: 'Pfizer', dosageForm: 'CAPSULE', strength: '20mg', packSize: '15 capsules', mrp: 105, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },
  { name: 'Flexon MR', genericName: 'Paracetamol + Chlorzoxazone', brandName: 'Flexon MR', manufacturerName: 'Aristo', dosageForm: 'TABLET', strength: '500mg + 250mg', packSize: '10 tablets', mrp: 65, hsn: '30049099', gstRate: 12 },

  // Antifungal / antiviral
  { name: 'Fluconazole 150', genericName: 'Fluconazole', brandName: 'Forcan', manufacturerName: 'Cipla', dosageForm: 'TABLET', strength: '150mg', packSize: '1 tablet', mrp: 22, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },
  { name: 'Itrasys 100', genericName: 'Itraconazole', brandName: 'Itrasys', manufacturerName: 'Systopic', dosageForm: 'CAPSULE', strength: '100mg', packSize: '10 capsules', mrp: 225, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },
  { name: 'Aciviral 400', genericName: 'Acyclovir', brandName: 'Aciviral', manufacturerName: 'Cadila', dosageForm: 'TABLET', strength: '400mg', packSize: '10 tablets', mrp: 145, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },

  // Worms / parasites
  { name: 'Bandy Plus', genericName: 'Albendazole + Ivermectin', brandName: 'Bandy Plus', manufacturerName: 'Mankind', dosageForm: 'TABLET', strength: '400mg + 6mg', packSize: '1 tablet', mrp: 25, hsn: '30049099', gstRate: 12 },
  { name: 'Zentel', genericName: 'Albendazole', brandName: 'Zentel', manufacturerName: 'GSK', dosageForm: 'TABLET', strength: '400mg', packSize: '1 tablet', mrp: 18, hsn: '30049099', gstRate: 12 },

  // Birth control / women's health
  { name: 'iPill', genericName: 'Levonorgestrel', brandName: 'iPill', manufacturerName: 'Piramal', dosageForm: 'TABLET', strength: '1.5mg', packSize: '1 tablet', mrp: 110, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },
  { name: 'Mala N', genericName: 'Levonorgestrel + Ethinyl Estradiol', brandName: 'Mala N', manufacturerName: 'HLL', dosageForm: 'TABLET', strength: '0.15mg + 0.03mg', packSize: '28 tablets', mrp: 18, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },

  // OTC / first aid
  { name: 'Iodex', genericName: 'Methyl Salicylate + Menthol', brandName: 'Iodex', manufacturerName: 'GSK', dosageForm: 'OINTMENT', strength: 'Multi', packSize: '40g', packUnit: 'g', mrp: 125, hsn: '30049099', gstRate: 12 },
  { name: 'Vicks Vaporub', genericName: 'Camphor + Eucalyptus + Menthol', brandName: 'Vicks', manufacturerName: 'Procter & Gamble', dosageForm: 'OINTMENT', strength: 'Multi', packSize: '50g', packUnit: 'g', mrp: 180, hsn: '30049099', gstRate: 18 },
  { name: 'Hansaplast', genericName: 'Adhesive Bandage', brandName: 'Hansaplast', manufacturerName: 'Beiersdorf', dosageForm: 'OTHER', strength: 'NA', packSize: '20 strips', mrp: 75, hsn: '30051090', gstRate: 12 },
  { name: 'Dettol Antiseptic', genericName: 'Chloroxylenol', brandName: 'Dettol', manufacturerName: 'Reckitt Benckiser', dosageForm: 'OTHER', strength: '4.8%', packSize: '125ml', packUnit: 'ml', mrp: 88, hsn: '30049099', gstRate: 18 },

  // Liver
  { name: 'Liv 52', genericName: 'Ayurvedic Liver Tonic', brandName: 'Liv 52', manufacturerName: 'Himalaya', dosageForm: 'TABLET', strength: 'Multi', packSize: '100 tablets', mrp: 165, hsn: '30049011', gstRate: 12 },
  { name: 'Udiliv 300', genericName: 'Ursodeoxycholic Acid', brandName: 'Udiliv', manufacturerName: 'Abbott', dosageForm: 'TABLET', strength: '300mg', packSize: '10 tablets', mrp: 285, hsn: '30049099', gstRate: 12, schedule: 'SCHEDULE_H', requiresPrescription: true },
]
