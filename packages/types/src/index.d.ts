export declare enum UserRole {
    SUPER_ADMIN = "SUPER_ADMIN",
    TENANT_ADMIN = "TENANT_ADMIN",
    STORE_MANAGER = "STORE_MANAGER",
    PHARMACIST = "PHARMACIST",
    SALES_REP = "SALES_REP",
    ACCOUNTANT = "ACCOUNTANT",
    DELIVERY_STAFF = "DELIVERY_STAFF",
    VIEWER = "VIEWER"
}
export declare enum TenantType {
    RETAIL_PHARMACY = "RETAIL_PHARMACY",
    WHOLESALE_DISTRIBUTOR = "WHOLESALE_DISTRIBUTOR",
    CHAIN_PHARMACY = "CHAIN_PHARMACY",
    HOSPITAL = "HOSPITAL",
    CLINIC = "CLINIC",
    SUPPLIER = "SUPPLIER"
}
export declare enum OrderStatus {
    DRAFT = "DRAFT",
    PENDING = "PENDING",
    CONFIRMED = "CONFIRMED",
    PROCESSING = "PROCESSING",
    PARTIALLY_SHIPPED = "PARTIALLY_SHIPPED",
    SHIPPED = "SHIPPED",
    DELIVERED = "DELIVERED",
    CANCELLED = "CANCELLED",
    RETURNED = "RETURNED"
}
export declare enum PaymentStatus {
    PENDING = "PENDING",
    PARTIAL = "PARTIAL",
    PAID = "PAID",
    OVERDUE = "OVERDUE",
    REFUNDED = "REFUNDED",
    WAIVED = "WAIVED"
}
export declare enum PaymentMethod {
    CASH = "CASH",
    UPI = "UPI",
    NEFT = "NEFT",
    RTGS = "RTGS",
    CHEQUE = "CHEQUE",
    CREDIT = "CREDIT",
    CARD = "CARD"
}
export declare enum DrugSchedule {
    OTC = "OTC",
    SCHEDULE_H = "SCHEDULE_H",
    SCHEDULE_H1 = "SCHEDULE_H1",
    SCHEDULE_X = "SCHEDULE_X",
    SCHEDULE_G = "SCHEDULE_G"
}
export declare enum DosageForm {
    TABLET = "TABLET",
    CAPSULE = "CAPSULE",
    SYRUP = "SYRUP",
    INJECTION = "INJECTION",
    CREAM = "CREAM",
    OINTMENT = "OINTMENT",
    DROPS = "DROPS",
    INHALER = "INHALER",
    PATCH = "PATCH",
    SUPPOSITORY = "SUPPOSITORY",
    POWDER = "POWDER",
    SUSPENSION = "SUSPENSION",
    GEL = "GEL",
    LOTION = "LOTION",
    SPRAY = "SPRAY"
}
export declare enum InvoiceType {
    SALE = "SALE",
    PURCHASE = "PURCHASE",
    CREDIT_NOTE = "CREDIT_NOTE",
    DEBIT_NOTE = "DEBIT_NOTE",
    RETURN = "RETURN"
}
export declare enum AlertType {
    LOW_STOCK = "LOW_STOCK",
    EXPIRY_SOON = "EXPIRY_SOON",
    EXPIRED = "EXPIRED",
    PRICE_CHANGE = "PRICE_CHANGE",
    ORDER_UPDATE = "ORDER_UPDATE",
    PAYMENT_DUE = "PAYMENT_DUE",
    REORDER_SUGGESTION = "REORDER_SUGGESTION"
}
export interface Tenant {
    id: string;
    name: string;
    slug: string;
    type: TenantType;
    gstin?: string;
    drugLicenseNumber?: string;
    phone: string;
    email: string;
    address: Address;
    settings: TenantSettings;
    plan: SubscriptionPlan;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export interface TenantSettings {
    currency: string;
    timezone: string;
    gstEnabled: boolean;
    eInvoicingEnabled: boolean;
    creditDays: number;
    lowStockThreshold: number;
    expiryAlertDays: number;
    autoReorderEnabled: boolean;
    whatsappNotifications: boolean;
    languages: string[];
}
export interface SubscriptionPlan {
    id: string;
    name: 'STARTER' | 'GROWTH' | 'PRO' | 'ENTERPRISE';
    maxUsers: number;
    maxStores: number;
    features: string[];
    priceMonthly: number;
    priceYearly: number;
}
export interface User {
    id: string;
    tenantId: string;
    name: string;
    email: string;
    phone: string;
    role: UserRole;
    storeIds: string[];
    isActive: boolean;
    lastLoginAt?: Date;
    createdAt: Date;
}
export interface Address {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
    coordinates?: {
        lat: number;
        lng: number;
    };
}
export interface Medicine {
    id: string;
    name: string;
    genericName: string;
    compositions: Composition[];
    manufacturer: string;
    manufacturerId?: string;
    brandName: string;
    dosageForm: DosageForm;
    strength: string;
    packSize: string;
    packUnit: string;
    mrp: number;
    hsn: string;
    gstRate: number;
    schedule: DrugSchedule;
    requiresPrescription: boolean;
    barcodes: string[];
    aliases: string[];
    substitutes: string[];
    isActive: boolean;
    thumbnailUrl?: string;
    createdAt: Date;
    updatedAt: Date;
}
export interface Composition {
    ingredient: string;
    strength: string;
    unit: string;
}
export interface InventoryItem {
    id: string;
    tenantId: string;
    storeId: string;
    medicineId: string;
    medicine?: Medicine;
    batches: Batch[];
    totalQuantity: number;
    availableQuantity: number;
    reservedQuantity: number;
    reorderLevel: number;
    reorderQuantity: number;
    sellingPrice: number;
    discountPercent: number;
    lastUpdated: Date;
}
export interface Batch {
    id: string;
    inventoryItemId: string;
    batchNumber: string;
    expiryDate: Date;
    manufacturingDate?: Date;
    quantity: number;
    purchasePrice: number;
    mrp: number;
    supplierId?: string;
    purchaseOrderId?: string;
    isQuarantined: boolean;
    createdAt: Date;
}
export interface Order {
    id: string;
    orderNumber: string;
    tenantId: string;
    storeId: string;
    customerId?: string;
    customer?: Customer;
    supplierId?: string;
    supplier?: Supplier;
    type: 'SALE' | 'PURCHASE';
    status: OrderStatus;
    items: OrderItem[];
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    total: number;
    paymentStatus: PaymentStatus;
    paymentMethod?: PaymentMethod;
    notes?: string;
    prescriptionId?: string;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}
export interface OrderItem {
    id: string;
    orderId: string;
    medicineId: string;
    medicine?: Medicine;
    batchId?: string;
    quantity: number;
    unitPrice: number;
    discountPercent: number;
    taxRate: number;
    taxAmount: number;
    total: number;
}
export interface Invoice {
    id: string;
    invoiceNumber: string;
    tenantId: string;
    storeId: string;
    type: InvoiceType;
    orderId?: string;
    customerId?: string;
    supplierId?: string;
    items: InvoiceItem[];
    subtotal: number;
    discountAmount: number;
    cgst: number;
    sgst: number;
    igst: number;
    totalTax: number;
    total: number;
    roundOff: number;
    grandTotal: number;
    paymentStatus: PaymentStatus;
    dueDate?: Date;
    irn?: string;
    qrCode?: string;
    eWayBillNumber?: string;
    createdAt: Date;
}
export interface InvoiceItem {
    id: string;
    invoiceId: string;
    medicineId: string;
    medicineName: string;
    batchNumber: string;
    expiryDate: Date;
    hsn: string;
    quantity: number;
    unitPrice: number;
    discountPercent: number;
    discountAmount: number;
    taxableAmount: number;
    cgstRate: number;
    cgstAmount: number;
    sgstRate: number;
    sgstAmount: number;
    igstRate: number;
    igstAmount: number;
    total: number;
}
export interface Supplier {
    id: string;
    tenantId: string;
    name: string;
    companyName: string;
    gstin?: string;
    drugLicenseNumber?: string;
    phone: string;
    email?: string;
    address: Address;
    creditDays: number;
    creditLimit: number;
    outstandingBalance: number;
    totalPurchases: number;
    isActive: boolean;
    tags: string[];
    createdAt: Date;
}
export interface Customer {
    id: string;
    tenantId: string;
    name: string;
    phone: string;
    email?: string;
    address?: Address;
    dateOfBirth?: Date;
    totalPurchases: number;
    outstandingBalance: number;
    creditLimit: number;
    prescriptions: string[];
    tags: string[];
    isActive: boolean;
    createdAt: Date;
}
export interface Prescription {
    id: string;
    tenantId: string;
    customerId: string;
    doctorName?: string;
    doctorRegistrationNo?: string;
    uploadedFileUrl: string;
    extractedData?: ExtractedPrescriptionData;
    verifiedBy?: string;
    verifiedAt?: Date;
    status: 'PENDING' | 'VERIFIED' | 'DISPENSED' | 'REJECTED';
    createdAt: Date;
}
export interface ExtractedPrescriptionData {
    patientName?: string;
    doctorName?: string;
    date?: string;
    medicines: {
        name: string;
        dosage?: string;
        frequency?: string;
        duration?: string;
        quantity?: number;
    }[];
    confidence: number;
}
export interface Payment {
    id: string;
    tenantId: string;
    invoiceId?: string;
    orderId?: string;
    customerId?: string;
    supplierId?: string;
    amount: number;
    method: PaymentMethod;
    reference?: string;
    upiTransactionId?: string;
    notes?: string;
    createdBy: string;
    createdAt: Date;
}
export interface LedgerEntry {
    id: string;
    tenantId: string;
    entityType: 'CUSTOMER' | 'SUPPLIER';
    entityId: string;
    type: 'DEBIT' | 'CREDIT';
    amount: number;
    balance: number;
    reference: string;
    description: string;
    invoiceId?: string;
    paymentId?: string;
    createdAt: Date;
}
export interface MedicineSearchResult {
    id: string;
    name: string;
    genericName: string;
    manufacturer: string;
    dosageForm: DosageForm;
    strength: string;
    packSize: string;
    mrp: number;
    schedule: DrugSchedule;
    score: number;
    matchType: 'EXACT' | 'FUZZY' | 'ALIAS' | 'COMPOSITION' | 'BARCODE';
    substitutes?: MedicineSearchResult[];
}
export interface MedicineNormalizationResult {
    input: string;
    normalized: string;
    medicineId?: string;
    confidence: number;
    components: {
        brandName?: string;
        genericName?: string;
        strength?: string;
        dosageForm?: string;
        packSize?: string;
        manufacturer?: string;
    };
}
export interface DashboardMetrics {
    today: {
        sales: number;
        purchases: number;
        revenue: number;
        orders: number;
        newCustomers: number;
    };
    inventory: {
        totalSkus: number;
        lowStockItems: number;
        expiringItems: number;
        expiredItems: number;
        totalValue: number;
    };
    finance: {
        outstanding: number;
        receivable: number;
        payable: number;
        cashInHand: number;
    };
    recentOrders: Order[];
    topMedicines: {
        medicine: Medicine;
        quantity: number;
        revenue: number;
    }[];
    alerts: Alert[];
}
export interface Alert {
    id: string;
    type: AlertType;
    title: string;
    message: string;
    entityId?: string;
    isRead: boolean;
    createdAt: Date;
}
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
    meta?: PaginationMeta;
}
export interface PaginationMeta {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
}
export interface PaginatedQuery {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}
export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}
export interface JwtPayload {
    userId: string;
    tenantId: string;
    role: UserRole;
    storeIds: string[];
}
//# sourceMappingURL=index.d.ts.map