# Security Specification for Keuangan Komite (School Committee Finance)

This document defines the security boundaries, data invariants, and malicious attack vector payloads ("Dirty Dozen") for the application's Firestore operations.

## 1. Data Invariants

1. **Authentication Requirement**: Only authenticated administrators (committee members, school staff) can read or write documents in `/students`, `/transactions`, `/events`, and `/student_bills`. Normal parents/wali murid are restricted or read-only (if applicable), but for our committee app, any authenticated admin member has write access, and general parents do not have standard write access.
2. **Transaction Integrity**: 
   - A transaction cannot have a negative or zero `amount`.
   - The field `createdAt` must strictly match `request.time`.
   - The field `recordedBy` must strictly match `request.auth.token.email`.
3. **Student Bill Integrity**:
   - `amountRequired` and `amountPaid` must be numbers, with `amountPaid` being less than or equal to `amountRequired` (or at least positive).
   - `id` of `student_bills` must match the format `id_period` (e.g., `studentId_period`) to prevent orphan bills or duplicates.
4. **Events Integrity**:
   - `budgetTarget` must be positive.
   - Status transitions must be strictly typed.

---

## 2. The "Dirty Dozen" Malicious Payloads

The following payloads represent malicious attempts to bypass security policies. They must all return `PERMISSION_DENIED` under the rules.

### student Collection Attacks:
1. **Unauthenticated Student Import**: A guest user tries to create a student.
2. **UID Injection**: An authenticated user tries to overwrite another student profile's fields without permissions.

### transaction Collection Attacks:
3. **Negative Transaction Overwrite**: Creating an expense of `-$5,000,000` to spoof budgets.
4. **Spoofed RecordedBy**: Creating a transaction set with `recordedBy: "admin@school.com"` while the request originates from `intruder@gmail.com`.
5. **Backdated/Postdated Creation**: Setting `createdAt` to a historical or future date instead of `request.time`.
6. **Immutable Fields Swapping**: Updating high-level fields like `type` or `amount` after a transaction is committed.

### student_bills Collection Attacks:
7. **Negative Payment Application**: Setting a bill's `amountPaid` to less than zero to credit/spoof balance.
8. **Bill Poisoning (Huge ID)**: Inserting a 10MB garbage string as a document ID to block transactions.
9. **Class/Roster Injection**: Overwriting status of outstanding billing periods.

### event Collection Attacks:
10. **State Corruption (Terminal Lock Outbreak)**: Directly updating a completed event's budget to zero to erase audits.
11. **Shadow Event Creation**: Injecting unauthorized fields like `{ isAdminServerOverride: true }`.
12. **Budget Spoil**: Setting a negative target budget to trigger front-end division-by-zero graphs.

---

## 3. Test Runner Concept

The `firestore.rules` will explicitly reject all the above cases. A simulator check will demonstrate that:
- Writes without authentication fail.
- Type mismatches and size violations are rejected at the rule level.
- Identity verification (comparing `request.auth.token.email` or `request.auth.uid`) is enforced.
