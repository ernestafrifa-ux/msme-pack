// Seed data for first-time setup. This exactly mirrors the live Santasi SDA
// Church database as of the July 2026 backup, so fresh installs start from
// the same categories, accounts, budget figures, and prior-year data that
// the Treasurer has set up and verified in production.
// Edit freely — this only runs once, the first time the server starts with
// an empty database.

const seedIncomeCats = [
  { id: "inc-tithe",    noteNo: 1,  name: "Tithe",                    subs: [] },
  { id: "inc-planned",  noteNo: 2,  name: "Planned Giving",            subs: [] },
  { id: "inc-loose",    noteNo: 3,  name: "Loose Offering",            subs: [] },
  { id: "inc-thanks",   noteNo: 4,  name: "Thanks Offering",           subs: [] },
  { id: "inc-cop",      noteNo: 5,  name: "COP",                       subs: ["Weekly Returns"] },
  { id: "inc-annual",   noteNo: 6,  name: "Annual Thanks Offering",    subs: ["Proceeds"] },
  { id: "inc-special",  noteNo: 7,  name: "Special Thanks Offering",   subs: [] },
  { id: "inc-ss",       noteNo: 8,  name: "Sabbath School",            subs: ["Offering", "Celebration"] },
  { id: "inc-cm",       noteNo: 9,  name: "Children's Ministries",     subs: ["Offering"] },
  { id: "inc-funeral",  noteNo: 10, name: "Funeral",                   subs: ["Contributions", "Dues", "Offering", "District contribution"] },
  { id: "inc-refund",   noteNo: 11, name: "Refund",                    subs: ["Repairs", "Project", "Music", "Transport", "Youth Ministries", "Camp meeting", "Administration", "Women Ministries", "Communication", "AMM", "Health", "Personal Ministries"] },
  { id: "inc-welfare",  noteNo: 12, name: "Welfare",                   subs: ["Needy Fund", "Lord supper", "Donations"] },
  { id: "inc-anyinam",  noteNo: 13, name: "Anyinam",                   subs: ["Weekly Returns"] },
  { id: "inc-water",    noteNo: 14, name: "Community water",           subs: ["Proceeds"] },
  { id: "inc-transport",noteNo: 15, name: "Transport",                 subs: ["Bus hiring"] },
  { id: "inc-invest",   noteNo: 16, name: "Investment",                subs: ["Interest (Heritage)", "Deposit"] },
  { id: "inc-yl",       noteNo: 17, name: "Young Ladies",              subs: ["Dues"] },
  { id: "inc-choir",    noteNo: 18, name: "Choir",                     subs: ["GACU", "Anniversary"] },
  { id: "inc-youth",    noteNo: 19, name: "Youth Ministries",          subs: ["T-Shirt", "Camp fees"] },
  { id: "inc-sb",       noteNo: 20, name: "Singing Band",              subs: ["Rally"] },
  { id: "inc-hf",       noteNo: 22, name: "Home and Family",           subs: ["Wedding"] },
  { id: "inc-yg",       noteNo: 23, name: "Young Gents",               subs: ["Dues"] },
  { id: "inc-amm",      noteNo: 24, name: "AMM",                       subs: ["Screening", "Games"] },
  { id: "inc-project",  noteNo: 25, name: "Project",                   subs: ["Donation"] },
  { id: "inc-deaconry", noteNo: 26, name: "Deaconry",                  subs: ["Contribution"] },
  { id: "inc-camp",     noteNo: 27, name: "Camp meeting",              subs: [] },
  { id: "inc-40th",     noteNo: 27, name: "Personal Ministries",       subs: ["Donations"] },
  { id: "inc-99e7d468d55e", noteNo: 28, name: "AMR",                   subs: ["Donation"] },
  { id: "inc-mission",  noteNo: 29, name: "Mission Offering",          subs: [] },
  { id: "inc-wm",       noteNo: 30, name: "Women Ministries",          subs: [] },
  { id: "inc-music",    noteNo: 31, name: "Music Department",          subs: [] },
  { id: "inc-darko",    noteNo: 32, name: "Stewardship",               subs: [] },
  { id: "inc-health",   noteNo: 33, name: "Health",                    subs: [] },
  { id: "inc-harvest",  noteNo: 34, name: "Harvest",                   subs: [] },
  { id: "inc-4d714e4ccce8", noteNo: 35, name: "Singles",               subs: [] },
  { id: "inc-d594b3afc38b", noteNo: 36, name: "Conference Funds",      subs: [] },
];

const seedExpenseCats = [
  { id: "exp-tithe",    noteNo: 1,  name: "Tithe",                     subs: [] },
  { id: "exp-planned",  noteNo: 2,  name: "Planned offering",          subs: ["Conference (40%)", "District (20%)"] },
  { id: "exp-loose",    noteNo: 3,  name: "Loose offering",            subs: ["Conference (40%)", "District (20%)"] },
  { id: "exp-thanks",   noteNo: 4,  name: "Thanks offering",           subs: ["Conference (40%)", "District (20%)"] },
  { id: "exp-ss",       noteNo: 8,  name: "Sabbath school",            subs: ["Lesson books", "Refunds", "Stationery", "Refreshment"] },
  { id: "exp-cm",       noteNo: 9,  name: "Children Ministries",       subs: ["Refreshment", "Stationery", "Workshop", "Love Feast", "Transportation"] },
  { id: "exp-funeral",  noteNo: 10, name: "Funeral",                   subs: ["Donations", "Transportation", "Feeding", "Dist. Contribution", "Stationery"] },
  { id: "exp-welfare",  noteNo: 12, name: "Welfare",                   subs: ["Donations", "Transportation"] },
  { id: "exp-anyinam",  noteNo: 13, name: "Anyinam",                   subs: ["Gen. expenses", "Camp mtg. fund"] },
  { id: "exp-water",    noteNo: 14, name: "Community water project",   subs: ["Commission"] },
  { id: "exp-transport",noteNo: 15, name: "Transport",                 subs: ["Hyundai bus repairs", "Coaster bus repairs", "Transportation", "Washing", "Fuel", "Allowance"] },
  { id: "exp-heritage", noteNo: 16, name: "Heritage Fund",             subs: ["Monthly payments"] },
  { id: "exp-yl",       noteNo: 17, name: "Young Ladies",              subs: ["Workshop"] },
  { id: "exp-choir",    noteNo: 18, name: "Choir",                     subs: ["Donations", "Transportation", "GACU", "Refreshment"] },
  { id: "exp-youth",    noteNo: 19, name: "Youth Ministries",          subs: ["Congress", "Week of Prayer", "Survival Camp", "Day Celebration", "Stationery", "Workshop", "Clean up", "Youth Camp"] },
  { id: "exp-sb",       noteNo: 20, name: "Singing Band",              subs: ["Rally", "Refreshment"] },
  { id: "exp-camp",     noteNo: 21, name: "Camp meeting",              subs: ["Feeding expenses", "Camp fund"] },
  { id: "exp-hf",       noteNo: 22, name: "Home and Family",           subs: ["Transportation", "Donations", "Week celebration"] },
  { id: "exp-yg",       noteNo: 23, name: "Young Gents",               subs: [] },
  { id: "exp-amm",      noteNo: 24, name: "AMM",                       subs: ["Congress", "Transportation", "Games"] },
  { id: "exp-project",  noteNo: 25, name: "Project",                   subs: ["Furniture", "Stall Const", "Toilet renovation", "Chairs-Darko", "Gen set Inst."] },
  { id: "exp-deaconry", noteNo: 26, name: "Deaconery",                 subs: ["Hiring of chairs", "Dumping fee", "Lord Supper", "Sanitary Items", "Refreshment", "Monthly cleaning", "Transportation", "Robes", "Excursion"] },
  { id: "exp-pm",       noteNo: 27, name: "Personal Ministries",       subs: ["10 Days Prayer sess.", "Evangelism", "Refreshment", "Workshop"] },
  { id: "exp-40th",     noteNo: 28, name: "AMR",                       subs: [] },
  { id: "exp-mission",  noteNo: 29, name: "Mission Offering",          subs: ["Conference (40%)", "District (20%)"] },
  { id: "exp-wm",       noteNo: 30, name: "Women Ministries",          subs: ["Donations", "Congress", "Transportation", "Week celebration"] },
  { id: "exp-music",    noteNo: 31, name: "Music",                     subs: ["Donation", "Transportation", "Combo repairs"] },
  { id: "exp-darko",    noteNo: 32, name: "Stewardship",               subs: [] },
  { id: "exp-health",   noteNo: 33, name: "Health",                    subs: ["First aid", "Screening"] },
  { id: "exp-harvest",  noteNo: 34, name: "Harvest",                   subs: ["Conference (10%)", "District (10%)"] },
  { id: "exp-singles",  noteNo: 35, name: "Singles",                   subs: [] },
  { id: "exp-conf",     noteNo: 36, name: "Conference fund",           subs: ["Donation"] },
  { id: "exp-salaries", noteNo: 37, name: "Salaries and allowances",   subs: ["Pastor", "Securities", "Caretakers", "Cleaner", "Driver"] },
  { id: "exp-utility",  noteNo: 38, name: "Utility bills",             subs: ["Electricity Bills"] },
  { id: "exp-repairs",  noteNo: 39, name: "Repairs and maintenance",   subs: ["Electrical", "Carpentry", "Mason", "Plumbing"] },
  { id: "exp-admin",    noteNo: 40, name: "Administration",            subs: ["Treasury Feeding", "Water", "Guest speakers", "Printing & Stationery", "Refreshment", "Call credit", "Board meeting", "Transportation", "Workshop/Seminars", "Postal fee", "Fuel", "Nor. C'ttee expenses", "Audit", "Fire extinguisher", "Session"] },
  { id: "exp-comm",     noteNo: 41, name: "Communication",             subs: ["Data", "Transportation", "Accessories", "Hiring of equipment"] },
  { id: "exp-edu",      noteNo: 42, name: "Education",                 subs: ["Support", "Donation"] },
  { id: "exp-bankchg",  noteNo: 43, name: "Bank Charges",              subs: ["Service charges", "Cheque books"] },
];

/* 2026 budget figures from live database */
const budget2026Income = {
  "inc-tithe": 891618.063, "inc-planned": 326483.34, "inc-loose": 56772.6,
  "inc-thanks": 35184.0, "inc-cop": 630000.0, "inc-annual": 20000.0,
  "inc-special": 5000.0, "inc-ss": 58000.0, "inc-cm": 25000.0,
  "inc-funeral": 70000.0, "inc-welfare": 10000.0, "inc-water": 7500.0,
  "inc-transport": 60000.0, "inc-yl": 1500.0, "inc-choir": 70000.0,
  "inc-youth": 34310.0, "inc-sb": 5000.0, "inc-hf": 5000.0,
  "inc-yg": 5000.0, "inc-amm": 5000.0, "inc-deaconry": 15000.0,
  "inc-99e7d468d55e": 5000.0, "inc-wm": 500.0, "inc-music": 3000.0,
};
const budget2026Expense = {
  "exp-tithe": 891618.063, "exp-planned": 195890.01, "exp-loose": 34063.56,
  "exp-thanks": 21110.4, "exp-ss": 50560.0, "exp-cm": 10000.0,
  "exp-funeral": 60000.0, "exp-welfare": 80140.0, "exp-water": 2500.0,
  "exp-transport": 70000.0, "exp-heritage": 12000.0, "exp-yl": 5000.0,
  "exp-choir": 38720.0, "exp-youth": 47710.0, "exp-sb": 26200.0,
  "exp-camp": 85000.0, "exp-hf": 10000.0, "exp-yg": 9500.0,
  "exp-amm": 10380.0, "exp-project": 270000.0, "exp-deaconry": 30000.0,
  "exp-pm": 70000.0, "exp-40th": 1500.0, "exp-wm": 20000.0,
  "exp-music": 55000.0, "exp-darko": 2500.0, "exp-health": 5660.0,
  "exp-singles": 1000.0, "exp-salaries": 50000.0, "exp-utility": 18000.0,
  "exp-repairs": 35000.0, "exp-admin": 85000.0, "exp-comm": 30400.0,
  "exp-edu": 10000.0, "exp-bankchg": 300.0,
};
const seedBudget = { 2026: { ...budget2026Income, ...budget2026Expense } };

/* 2024 prior year actuals from live database */
const priorYearIncome = {
  "inc-40th": 478708.0, "inc-amm": 745.0, "inc-anyinam": 7751.7,
  "inc-camp": 30500.0, "inc-cm": 14276.9, "inc-cop": 247857.1,
  "inc-darko": 5000.0, "inc-deaconry": 7325.0, "inc-funeral": 58088.0,
  "inc-harvest": 1720.0, "inc-health": 1215.0, "inc-hf": 3095.9,
  "inc-loose": 33171.2, "inc-mission": 46.0, "inc-music": 1000.0,
  "inc-planned": 229845.9, "inc-refund": 12749.67, "inc-sb": 6790.0,
  "inc-special": 15110.8, "inc-ss": 39015.1, "inc-thanks": 25465.0,
  "inc-tithe": 596952.2, "inc-transport": 59660.0, "inc-welfare": 4784.8,
  "inc-wm": 124.0, "inc-yg": 655.0, "inc-yl": 722.0, "inc-youth": 25214.0,
};
const priorYearExpense = {
  "exp-40th": 194495.0, "exp-admin": 64761.3, "exp-amm": 1080.0,
  "exp-bankchg": 373.0, "exp-camp": 51520.0, "exp-choir": 1470.0,
  "exp-cm": 6780.0, "exp-comm": 18449.0, "exp-conf": 1500.0,
  "exp-darko": 6481.18, "exp-deaconry": 28738.0, "exp-edu": 11268.0,
  "exp-funeral": 63620.0, "exp-health": 2380.0, "exp-heritage": 14000.0,
  "exp-hf": 8080.0, "exp-loose": 19515.84, "exp-music": 3500.0,
  "exp-planned": 137085.54, "exp-pm": 28135.0, "exp-project": 151220.0,
  "exp-repairs": 28190.0, "exp-salaries": 31800.0, "exp-sb": 20503.0,
  "exp-singles": 600.0, "exp-ss": 48720.0, "exp-thanks": 15627.0,
  "exp-tithe": 580591.9, "exp-transport": 75284.0, "exp-utility": 16700.0,
  "exp-welfare": 37570.0, "exp-wm": 2880.0, "exp-youth": 19210.0,
};
const seedPriorYear = { 2024: { ...priorYearIncome, ...priorYearExpense } };

/* Accounts matching the live database exactly */
const seedAccounts = [
  { id: "cash-1",  kind: "cash", name: "Cash in hand",                        accNo: "",                 opening: 1000.00,      deletable: false },
  { id: "bank-1",  kind: "bank", name: "AKCB PLC - SDA CHURCH SANTASI",       accNo: "1081220005519351", opening: 164055.26,    deletable: true },
  { id: "bank-2",  kind: "bank", name: "HERITAGE FUND - SANTASI SDA CHURCH",  accNo: "2041001000218601", opening: 66150.13,     deletable: true },
];

const seedMembers = [
  { id: "mem-1", name: "Edna Gyau Baffour", envelopeNo: "001", phone: "", email: "" },
  { id: "mem-2", name: "Augustine Owusu",   envelopeNo: "002", phone: "", email: "" },
];

/* Disclosures as at 31 December 2025 */
const seedDisclosures = [
  { id: "disc-1", year: 2025, category: "investment",          label: "Heritage Fund",            amount: 66150.13, note: "" },
  { id: "disc-2", year: 2025, category: "investment",          label: "AKRB Fixed Deposit (12%)", amount: 12751.83, note: "" },
  { id: "disc-3", year: 2025, category: "payable",             label: "Anyinam (company)",        amount: 27236.40, note: "" },
  { id: "disc-4", year: 2025, category: "trustfund-conference",label: "Tithe",                    amount: 46784.00, note: "" },
  { id: "disc-5", year: 2025, category: "trustfund-conference",label: "40% Systematic",           amount: 8962.20,  note: "" },
  { id: "disc-6", year: 2025, category: "trustfund-district",  label: "20% Systematic",           amount: 4481.10,  note: "" },
];

const seedRoles = [
  { id: "role-treasurer",           name: "Treasurer",            canEdit: true,  canSeeNotes: true,  canAdmin: true,  builtIn: true },
  { id: "role-assistant-treasurer", name: "Assistant Treasurer",  canEdit: true,  canSeeNotes: true,  canAdmin: false, builtIn: true },
  { id: "role-data-entry",          name: "Data Entry",           canEdit: true,  canSeeNotes: true,  canAdmin: false, builtIn: true },
  { id: "role-auditor",             name: "Auditor",              canEdit: false, canSeeNotes: true,  canAdmin: false, builtIn: true },
  { id: "role-pastor",              name: "Pastor",               canEdit: false, canSeeNotes: false, canAdmin: false, builtIn: true },
  { id: "role-elder",               name: "Elder",                canEdit: false, canSeeNotes: false, canAdmin: false, builtIn: true },
  { id: "role-secretary",           name: "Secretary",            canEdit: false, canSeeNotes: false, canAdmin: false, builtIn: true },
];

const seedUsers = [
  { id: "user-1", name: "Treasurer (you)",  roleId: "role-treasurer", phone: "", email: "" },
  { id: "user-2", name: "Head Elder",       roleId: "role-elder",     phone: "", email: "" },
  { id: "user-3", name: "District Auditor", roleId: "role-auditor",   phone: "", email: "" },
];

module.exports = {
  seedIncomeCats, seedExpenseCats,
  priorYearIncome, priorYearExpense,
  budget2026Income, budget2026Expense,
  seedBudget, seedPriorYear,
  seedAccounts, seedMembers, seedDisclosures, seedRoles, seedUsers
};
