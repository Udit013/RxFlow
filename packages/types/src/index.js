"use strict";
// ─── Enums ────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlertType = exports.InvoiceType = exports.DosageForm = exports.DrugSchedule = exports.PaymentMethod = exports.PaymentStatus = exports.OrderStatus = exports.TenantType = exports.UserRole = void 0;
var UserRole;
(function (UserRole) {
    UserRole["SUPER_ADMIN"] = "SUPER_ADMIN";
    UserRole["TENANT_ADMIN"] = "TENANT_ADMIN";
    UserRole["STORE_MANAGER"] = "STORE_MANAGER";
    UserRole["PHARMACIST"] = "PHARMACIST";
    UserRole["SALES_REP"] = "SALES_REP";
    UserRole["ACCOUNTANT"] = "ACCOUNTANT";
    UserRole["DELIVERY_STAFF"] = "DELIVERY_STAFF";
    UserRole["VIEWER"] = "VIEWER";
})(UserRole || (exports.UserRole = UserRole = {}));
var TenantType;
(function (TenantType) {
    TenantType["RETAIL_PHARMACY"] = "RETAIL_PHARMACY";
    TenantType["WHOLESALE_DISTRIBUTOR"] = "WHOLESALE_DISTRIBUTOR";
    TenantType["CHAIN_PHARMACY"] = "CHAIN_PHARMACY";
    TenantType["HOSPITAL"] = "HOSPITAL";
    TenantType["CLINIC"] = "CLINIC";
    TenantType["SUPPLIER"] = "SUPPLIER";
})(TenantType || (exports.TenantType = TenantType = {}));
var OrderStatus;
(function (OrderStatus) {
    OrderStatus["DRAFT"] = "DRAFT";
    OrderStatus["PENDING"] = "PENDING";
    OrderStatus["CONFIRMED"] = "CONFIRMED";
    OrderStatus["PROCESSING"] = "PROCESSING";
    OrderStatus["PARTIALLY_SHIPPED"] = "PARTIALLY_SHIPPED";
    OrderStatus["SHIPPED"] = "SHIPPED";
    OrderStatus["DELIVERED"] = "DELIVERED";
    OrderStatus["CANCELLED"] = "CANCELLED";
    OrderStatus["RETURNED"] = "RETURNED";
})(OrderStatus || (exports.OrderStatus = OrderStatus = {}));
var PaymentStatus;
(function (PaymentStatus) {
    PaymentStatus["PENDING"] = "PENDING";
    PaymentStatus["PARTIAL"] = "PARTIAL";
    PaymentStatus["PAID"] = "PAID";
    PaymentStatus["OVERDUE"] = "OVERDUE";
    PaymentStatus["REFUNDED"] = "REFUNDED";
    PaymentStatus["WAIVED"] = "WAIVED";
})(PaymentStatus || (exports.PaymentStatus = PaymentStatus = {}));
var PaymentMethod;
(function (PaymentMethod) {
    PaymentMethod["CASH"] = "CASH";
    PaymentMethod["UPI"] = "UPI";
    PaymentMethod["NEFT"] = "NEFT";
    PaymentMethod["RTGS"] = "RTGS";
    PaymentMethod["CHEQUE"] = "CHEQUE";
    PaymentMethod["CREDIT"] = "CREDIT";
    PaymentMethod["CARD"] = "CARD";
})(PaymentMethod || (exports.PaymentMethod = PaymentMethod = {}));
var DrugSchedule;
(function (DrugSchedule) {
    DrugSchedule["OTC"] = "OTC";
    DrugSchedule["SCHEDULE_H"] = "SCHEDULE_H";
    DrugSchedule["SCHEDULE_H1"] = "SCHEDULE_H1";
    DrugSchedule["SCHEDULE_X"] = "SCHEDULE_X";
    DrugSchedule["SCHEDULE_G"] = "SCHEDULE_G";
})(DrugSchedule || (exports.DrugSchedule = DrugSchedule = {}));
var DosageForm;
(function (DosageForm) {
    DosageForm["TABLET"] = "TABLET";
    DosageForm["CAPSULE"] = "CAPSULE";
    DosageForm["SYRUP"] = "SYRUP";
    DosageForm["INJECTION"] = "INJECTION";
    DosageForm["CREAM"] = "CREAM";
    DosageForm["OINTMENT"] = "OINTMENT";
    DosageForm["DROPS"] = "DROPS";
    DosageForm["INHALER"] = "INHALER";
    DosageForm["PATCH"] = "PATCH";
    DosageForm["SUPPOSITORY"] = "SUPPOSITORY";
    DosageForm["POWDER"] = "POWDER";
    DosageForm["SUSPENSION"] = "SUSPENSION";
    DosageForm["GEL"] = "GEL";
    DosageForm["LOTION"] = "LOTION";
    DosageForm["SPRAY"] = "SPRAY";
})(DosageForm || (exports.DosageForm = DosageForm = {}));
var InvoiceType;
(function (InvoiceType) {
    InvoiceType["SALE"] = "SALE";
    InvoiceType["PURCHASE"] = "PURCHASE";
    InvoiceType["CREDIT_NOTE"] = "CREDIT_NOTE";
    InvoiceType["DEBIT_NOTE"] = "DEBIT_NOTE";
    InvoiceType["RETURN"] = "RETURN";
})(InvoiceType || (exports.InvoiceType = InvoiceType = {}));
var AlertType;
(function (AlertType) {
    AlertType["LOW_STOCK"] = "LOW_STOCK";
    AlertType["EXPIRY_SOON"] = "EXPIRY_SOON";
    AlertType["EXPIRED"] = "EXPIRED";
    AlertType["PRICE_CHANGE"] = "PRICE_CHANGE";
    AlertType["ORDER_UPDATE"] = "ORDER_UPDATE";
    AlertType["PAYMENT_DUE"] = "PAYMENT_DUE";
    AlertType["REORDER_SUGGESTION"] = "REORDER_SUGGESTION";
})(AlertType || (exports.AlertType = AlertType = {}));
//# sourceMappingURL=index.js.map