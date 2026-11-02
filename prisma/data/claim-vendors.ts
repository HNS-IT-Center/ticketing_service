/**
 * The service centres and suppliers the shop sends warranty claims to — the
 * owner's list of 2026-10-27, as given. LKL = dalam kota, ITR = luar kota.
 *
 * Loaded by `npm run seed` (local) and `npm run import:vendors` (any database,
 * dry run unless --apply). To add a vendor: append a line here and run the
 * import again. Names already in the list are matched case-insensitively and
 * keep their existing spelling; nothing is ever deleted or deactivated.
 */
export const CLAIM_VENDORS: ReadonlyArray<{ name: string; location: "LKL" | "ITR" }> = [
  { name: "GMS", location: "ITR" },
  { name: "AGRES BATAM", location: "LKL" },
  { name: "AGRES JAKARTA", location: "ITR" },
  { name: "FANTECH", location: "ITR" },
  { name: "DATASCRIPT", location: "ITR" },
  { name: "WPG", location: "ITR" },
  { name: "ASUS SERVICE CENTER", location: "LKL" },
  { name: "ATI", location: "ITR" },
  { name: "ASIARAYA", location: "ITR" },
  { name: "MICRO KOMPUTER", location: "LKL" },
  { name: "Lita Asteros", location: "ITR" },
  { name: "Dova", location: "ITR" },
  { name: "REXUS", location: "ITR" },
  { name: "AGRES IT JAKARTA", location: "ITR" },
  { name: "INDIGITAL", location: "ITR" },
  { name: "EMEDIA", location: "ITR" },
  { name: "Surya Candra", location: "ITR" },
  { name: "SUN", location: "ITR" },
  { name: "KMN", location: "LKL" },
  { name: "DUTA COMPUTER", location: "LKL" },
  { name: "MDP", location: "ITR" },
  { name: "ASTRINDO", location: "ITR" },
  { name: "SEMPURNA", location: "ITR" },
  { name: "ASTEROS", location: "ITR" },
  { name: "AUKEY", location: "ITR" },
  { name: "INKSHOP", location: "LKL" },
  { name: "EPSON", location: "LKL" },
  { name: "KLIP", location: "ITR" },
  { name: "SCHNEIDER", location: "LKL" },
  { name: "NJT", location: "ITR" },
  { name: "DIGITAL TEKNOLOGI", location: "ITR" },
  { name: "AJAZZ", location: "ITR" },
  { name: "LENOVO", location: "LKL" },
  { name: "OXIMUS", location: "ITR" },
  { name: "TIXPRO", location: "ITR" },
  { name: "LEAPFROG", location: "ITR" },
  { name: "ENTERKOM", location: "ITR" },
  { name: "UNICOM", location: "LKL" },
  { name: "DUNIA CYBER", location: "ITR" },
  { name: "SYNEX", location: "ITR" },
];
