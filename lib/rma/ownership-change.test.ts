import { describe, expect, it } from "vitest";
import type { RmaStatus } from "@prisma/client";
import {
  SWITCHED_TO_STORE_NOTE,
  isSwitchedToStore,
  ownershipChangeNote,
  stockDataPending,
  validateOwnershipChange,
  validateStockData,
} from "./ownership-change";

const base = { role: "RMA", status: "submitted_to_vendor" as RmaStatus, current: "customer" as const, next: "store_stock", reason: "Ditukar stok" };

describe("validateOwnershipChange", () => {
  it("accepts the desk switching an open case, at any open stage, with a reason only", () => {
    expect(validateOwnershipChange(base)).toEqual({ ok: true, next: "store_stock", reason: "Ditukar stok" });
  });
  it("refuses anyone but RMA, an ended case, no change, and a missing reason", () => {
    expect(validateOwnershipChange({ ...base, role: "Administrator" }).ok).toBe(false);
    expect(validateOwnershipChange({ ...base, role: "StockAdmin" }).ok).toBe(false);
    expect(validateOwnershipChange({ ...base, status: "closed" }).ok).toBe(false);
    expect(validateOwnershipChange({ ...base, next: "customer" }).ok).toBe(false);
    expect(validateOwnershipChange({ ...base, next: "x" }).ok).toBe(false);
    expect(validateOwnershipChange({ ...base, reason: "  " }).ok).toBe(false);
  });
});

describe("the switch note", () => {
  it("begins with the marker a switch to store stock is found by", () => {
    expect(ownershipChangeNote("customer", "store_stock", "Ditukar stok").startsWith(SWITCHED_TO_STORE_NOTE)).toBe(true);
    expect(ownershipChangeNote("store_stock", "customer", "Salah input").startsWith(SWITCHED_TO_STORE_NOTE)).toBe(false);
  });
  it("keeps the stock data it clears", () => {
    expect(ownershipChangeNote("store_stock", "customer", "Salah input", { stock_origin: "Toko NGH", stock_transfer_number: "PM-1" })).toBe(
      "Kepemilikan diubah: Klaim Toko → Klaim User. Alasan: Salah input (sebelumnya asal stok Toko NGH, nomor pemindahan PM-1)",
    );
  });
  it("marks a case as switched only while it is store stock", () => {
    const events = [{ note: ownershipChangeNote("customer", "store_stock", "x") }];
    expect(isSwitchedToStore("store_stock", events)).toBe(true);
    expect(isSwitchedToStore("customer", events)).toBe(false);
    expect(isSwitchedToStore("store_stock", [{ note: null }])).toBe(false);
  });
});

describe("validateStockData — Admin Stok", () => {
  const ok = { role: "StockAdmin", switched: true, stockOrigin: "Toko NGH", transferNumber: "PM-9" };
  it("takes both fields from Admin Stok on a switched case", () => {
    expect(validateStockData(ok)).toEqual({ ok: true, stockOrigin: "Toko NGH", transferNumber: "PM-9" });
  });
  it("refuses other roles, a case not switched by RMA, and a missing field", () => {
    expect(validateStockData({ ...ok, role: "RMA" }).ok).toBe(false);
    expect(validateStockData({ ...ok, switched: false }).ok).toBe(false);
    expect(validateStockData({ ...ok, stockOrigin: " " }).ok).toBe(false);
    expect(validateStockData({ ...ok, transferNumber: null }).ok).toBe(false);
  });
  it("reports a case as pending until both are there", () => {
    expect(stockDataPending({ stock_origin: "Toko", stock_transfer_number: null })).toBe(true);
    expect(stockDataPending({ stock_origin: "Toko", stock_transfer_number: "PM" })).toBe(false);
  });
});
