/**
 * UI translations. Messages are keyed by their English source text (gettext-style), so any
 * string without a translation simply renders in English — pages can be translated one at a
 * time without breaking anything. The language comes from the pharmacy's locale
 * (Settings → Region & tax): "hi-IN" → Hindi, "es-US" → Spanish, anything else → English.
 *
 * To add a language: add a dictionary below and list it in DICTIONARIES.
 */
import { useRegion } from './region'

type Dictionary = Record<string, string>

const hi: Dictionary = {
  // Navigation
  'Overview': 'अवलोकन', 'Operations': 'संचालन', 'Catalog': 'कैटलॉग', 'Stakeholders': 'हितधारक', 'Admin': 'प्रशासन',
  'Dashboard': 'डैशबोर्ड', 'Analytics': 'विश्लेषण', 'Inventory': 'इन्वेंटरी', 'Stock Takes': 'स्टॉक गणना',
  'Stock Transfers': 'स्टॉक स्थानांतरण', 'Orders': 'ऑर्डर', 'New Purchase': 'नई खरीद', 'Purchase Returns': 'खरीद वापसी',
  'Billing / POS': 'बिलिंग / POS', 'Invoices': 'इनवॉइस', 'Medicines': 'दवाइयाँ', 'Categories': 'श्रेणियाँ',
  'Medicine Search': 'दवा खोज', 'Customers': 'ग्राहक', 'Suppliers': 'आपूर्तिकर्ता', 'Sales Reps': 'बिक्री प्रतिनिधि',
  'Staff & Payroll': 'कर्मचारी और वेतन', 'Stores': 'स्टोर', 'Accounts': 'खाते', 'Reports': 'रिपोर्ट',
  'Compliance': 'अनुपालन', 'Audit Log': 'ऑडिट लॉग', 'Backup & Import': 'बैकअप और आयात', 'Alerts': 'अलर्ट',
  'Settings': 'सेटिंग्स',
  // Chrome
  'Find anything…': 'कुछ भी खोजें…', 'Sign out': 'साइन आउट', 'Open navigation': 'नेविगेशन खोलें',
  'Close navigation': 'नेविगेशन बंद करें', 'Account menu': 'खाता मेनू', 'Skip to content': 'मुख्य सामग्री पर जाएँ',
  'Waking up the server — the first visit after a quiet spell can take up to a minute.':
    'सर्वर शुरू हो रहा है — कुछ समय बाद पहली बार खोलने पर इसमें एक मिनट तक लग सकता है।',
  // Live-sync badge
  'Live': 'लाइव', 'Sync paused': 'सिंक रुका', 'Offline': 'ऑफ़लाइन', 'Connecting…': 'कनेक्ट हो रहा है…',
}

const es: Dictionary = {
  'Overview': 'Resumen', 'Operations': 'Operaciones', 'Catalog': 'Catálogo', 'Stakeholders': 'Contactos', 'Admin': 'Administración',
  'Dashboard': 'Panel', 'Analytics': 'Analítica', 'Inventory': 'Inventario', 'Stock Takes': 'Recuentos de inventario',
  'Stock Transfers': 'Traslados de inventario', 'Orders': 'Pedidos', 'New Purchase': 'Nueva compra',
  'Purchase Returns': 'Devoluciones de compra', 'Billing / POS': 'Facturación / TPV', 'Invoices': 'Facturas',
  'Medicines': 'Medicamentos', 'Categories': 'Categorías', 'Medicine Search': 'Búsqueda de medicamentos',
  'Customers': 'Clientes', 'Suppliers': 'Proveedores', 'Sales Reps': 'Representantes', 'Staff & Payroll': 'Personal y nóminas',
  'Stores': 'Tiendas', 'Accounts': 'Contabilidad', 'Reports': 'Informes', 'Compliance': 'Cumplimiento normativo',
  'Audit Log': 'Registro de auditoría', 'Backup & Import': 'Copia de seguridad e importación', 'Alerts': 'Alertas',
  'Settings': 'Configuración',
  'Find anything…': 'Buscar…', 'Sign out': 'Cerrar sesión', 'Open navigation': 'Abrir navegación',
  'Close navigation': 'Cerrar navegación', 'Account menu': 'Menú de la cuenta', 'Skip to content': 'Saltar al contenido',
  'Waking up the server — the first visit after a quiet spell can take up to a minute.':
    'Activando el servidor: la primera visita tras un periodo de inactividad puede tardar hasta un minuto.',
  'Live': 'En vivo', 'Sync paused': 'Sincronización en pausa', 'Offline': 'Sin conexión', 'Connecting…': 'Conectando…',
}

const DICTIONARIES: Record<string, Dictionary> = { hi, es }

/** "hi-IN" → "hi"; unknown languages → "en". */
export function languageOf(locale: string | null | undefined): string {
  const lang = (locale ?? 'en').split('-')[0]!.toLowerCase()
  return DICTIONARIES[lang] ? lang : 'en'
}

export function translate(locale: string | null | undefined, message: string): string {
  return DICTIONARIES[languageOf(locale)]?.[message] ?? message
}

/** React hook: `const t = useT(); t('Inventory')`. */
export function useT(): (message: string) => string {
  const { locale } = useRegion()
  return (message: string) => translate(locale, message)
}
