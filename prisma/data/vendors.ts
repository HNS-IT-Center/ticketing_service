/**
 * The shop's vendor list — the owner's list of 2026-11-04, as given (it
 * replaces the claim-only list of 2026-10-27).
 *
 * - location: LKL = dalam kota, ITR = luar kota.
 * - kind, as the list's third column says it:
 *     "claim"          KLAIM GARANSI    → warranty claims only
 *     "service_center" SERVICE CENTER   → warranty claims and external service
 *     "parts"          Supplier part    → sells the parts fitted during a service
 *     "external"       Service eksternal→ external repairs only
 *   The import sets exactly these roles, removing any other (owner, 2026-11-04:
 *   "kalau dia klaim garansi itu cuman bisa klaim garansi").
 * - contact: a phone number (written as on the list; one starting 62 is stored
 *   as +62…) or an e-mail. Absent = leave whatever is recorded.
 * - formerly: names the vendor was entered under before. If the new name is not
 *   on the table yet but a former one is, that vendor is renamed instead of a
 *   second one being created. Its cases keep the name they were sent under.
 *
 * Loaded by `npm run seed` (local) and `npm run import:vendors` (any database,
 * dry run unless --apply). To add a vendor: append a line here and run the
 * import again. Names are matched case-insensitively and keep their existing
 * spelling; nothing is ever deleted or deactivated.
 */
export type VendorKind = "claim" | "service_center" | "parts" | "external";

export type VendorListEntry = {
  name: string;
  location: "LKL" | "ITR";
  kind: VendorKind;
  contact?: string;
  formerly?: string[];
};

export const VENDOR_LIST: ReadonlyArray<VendorListEntry> = [
  { name: "GMS", location: "ITR", kind: "claim", contact: "6281927006000" },
  { name: "AGRES BATAM", location: "LKL", kind: "service_center", contact: "6281234314372" },
  { name: "AGRES JAKARTA KOMPONEN", location: "ITR", kind: "claim", contact: "6281222003830" },
  { name: "AGRES JAKARTA MONITOR", location: "ITR", kind: "claim", contact: "6281316005990" },
  { name: "FANTECH", location: "ITR", kind: "claim", contact: "6281119032716" },
  { name: "DATASCRIPT", location: "ITR", kind: "claim", contact: "62874482" },
  { name: "WPG", location: "ITR", kind: "claim", contact: "628132282881" },
  { name: "ASUS SERVICE CENTER", location: "LKL", kind: "service_center", contact: "6287824896011" },
  { name: "ATI", location: "ITR", kind: "claim", contact: "6281315552388" },
  { name: "ASIARAYA", location: "ITR", kind: "claim", contact: "628113605915" },
  { name: "MICRO KOMPUTER", location: "LKL", kind: "claim", contact: "62822854488" },
  { name: "Lita Asteros", location: "ITR", kind: "claim", contact: "6285777771760" },
  { name: "DOVA (THERMALTAKE)", location: "ITR", kind: "claim", contact: "6281513151111", formerly: ["Dova"] },
  { name: "REXUS", location: "ITR", kind: "claim", contact: "6281319326787" },
  { name: "AGRES IT JAKARTA", location: "ITR", kind: "claim", contact: "6281119727864" },
  { name: "INDIGITAL", location: "ITR", kind: "claim", contact: "6287810464342" },
  { name: "EMEDIA", location: "ITR", kind: "claim", contact: "6281901600029" },
  { name: "Surya Candra", location: "ITR", kind: "claim", contact: "6281385081885" },
  { name: "SUN", location: "ITR", kind: "claim", contact: "6285260915174" },
  { name: "KMN", location: "LKL", kind: "service_center", contact: "628542591" },
  { name: "DUTA COMPUTER", location: "LKL", kind: "service_center", contact: "6282375594043" },
  { name: "MDP", location: "ITR", kind: "claim", contact: "62811712035" },
  { name: "ASTRINDO", location: "ITR", kind: "claim", contact: "6285888881054" },
  { name: "SEMPURNA", location: "ITR", kind: "claim", contact: "6281574635177" },
  { name: "ASTEROS", location: "ITR", kind: "claim", contact: "6285777771760" },
  { name: "AUKEY", location: "ITR", kind: "claim", contact: "6281286355050" },
  { name: "INKSHOP", location: "LKL", kind: "service_center", contact: "628117770323" },
  { name: "EPSON", location: "LKL", kind: "service_center", contact: "6281267611828" },
  { name: "KLIP", location: "ITR", kind: "claim", contact: "6287810464342" },
  { name: "SCHNEIDER", location: "LKL", kind: "service_center", contact: "customercare.id@schneiderelectric.com" },
  { name: "NJT", location: "ITR", kind: "claim", contact: "628551200300" },
  { name: "DIGITAL TEKNOLOGI", location: "ITR", kind: "claim", contact: "6287807497" },
  { name: "AJAZZ", location: "ITR", kind: "claim", contact: "6281389327935" },
  { name: "LENOVO", location: "LKL", kind: "service_center", contact: "18030161224" },
  { name: "OXIMUS", location: "ITR", kind: "claim", contact: "62851178070" },
  { name: "TIXPRO", location: "ITR", kind: "claim", contact: "heri.sunaryanto@tixpromegah.com" },
  { name: "LEAPFROG", location: "ITR", kind: "claim", contact: "6282123984842" },
  { name: "ENTERKOM", location: "ITR", kind: "claim", contact: "6281310766339" },
  { name: "UNICOM", location: "LKL", kind: "service_center", contact: "6282288753371" },
  { name: "DUNIA CYBER", location: "ITR", kind: "claim", contact: "6281574635177" },
  { name: "SYNEX", location: "ITR", kind: "claim", contact: "Admin.Rizal@metrodata.co.id" },
  { name: "SNC", location: "LKL", kind: "parts" },
  { name: "KO APUI", location: "LKL", kind: "external" },
];
