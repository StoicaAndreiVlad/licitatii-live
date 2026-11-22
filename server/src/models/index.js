import { DataTypes } from "sequelize";

export const ROLES = ["admin", "bidder"];
export const AUCTION_STATUSES = ["DRAFT", "SCHEDULED", "ACTIVE", "ENDED", "CANCELLED"];
export const OPEN_AUCTION_STATUSES = ["DRAFT", "SCHEDULED", "ACTIVE"];
export const OUTCOMES = ["SOLD", "UNSOLD"];
export const BID_STATUSES = ["ACCEPTED", "REJECTED"];
export const CATEGORIES = ["arta", "electronice", "carti", "colectii", "mobilier", "altele"];
export const MAX_AMOUNT = 1_000_000_000;
export const MIN_DURATION_SEC = 30;
export const MAX_DURATION_SEC = 7 * 24 * 60 * 60;

// Pe SQLite, DataTypes.ENUM devine TEXT fără validare, deci folosim STRING + isIn: [[...]].
const oneOf = (values) => ({ isIn: { args: [values], msg: `Valoarea trebuie să fie una dintre: ${values.join(", ")}` } });
const money = { isInt: true, min: 1, max: MAX_AMOUNT };

export function defineModels(sequelize) {
  const User = sequelize.define("User", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    email: {
      type: DataTypes.STRING(254),
      allowNull: false,
      unique: true,
      validate: { isEmail: true },
      set(value) {
        this.setDataValue("email", typeof value === "string" ? value.trim().toLowerCase() : value);
      },
    },
    displayName: { type: DataTypes.STRING(60), allowNull: false, validate: { len: [2, 60] } },
    passwordHash: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.STRING(10), allowNull: false, defaultValue: "bidder", validate: oneOf(ROLES) },
  }, {
    // Hash-ul parolei nu este încărcat implicit; autentificarea folosește User.unscoped().
    defaultScope: { attributes: { exclude: ["passwordHash"] } },
  });

  // Chiar și o instanță încărcată cu unscoped() nu serializează hash-ul.
  User.prototype.toJSON = function toJSON() {
    const { passwordHash, ...safe } = this.get({ plain: true });
    return safe;
  };

  const Item = sequelize.define("Item", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    title: { type: DataTypes.STRING(120), allowNull: false, validate: { len: [3, 120] } },
    description: { type: DataTypes.TEXT, allowNull: true, validate: { len: [0, 2000] } },
    category: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "altele", validate: oneOf(CATEGORIES) },
    imageUrl: { type: DataTypes.STRING(500), allowNull: true, validate: { isUrl: true } },
  });

  const Auction = sequelize.define("Auction", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    status: { type: DataTypes.STRING(12), allowNull: false, defaultValue: "DRAFT", validate: oneOf(AUCTION_STATUSES) },
    startPrice: { type: DataTypes.INTEGER, allowNull: false, validate: money },
    minIncrement: { type: DataTypes.INTEGER, allowNull: false, validate: money },
    durationSec: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { isInt: true, min: MIN_DURATION_SEC, max: MAX_DURATION_SEC },
    },
    currentPrice: { type: DataTypes.INTEGER, allowNull: true, validate: money },
    // seq-ul ultimului eveniment care a schimbat licitația (regula R11)
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { isInt: true, min: 0 } },
    extensionsUsed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { isInt: true, min: 0 } },
    startsAt: { type: DataTypes.DATE, allowNull: true },
    endsAt: { type: DataTypes.DATE, allowNull: true },
    outcome: { type: DataTypes.STRING(8), allowNull: true, validate: oneOf(OUTCOMES) },
    endedAt: { type: DataTypes.DATE, allowNull: true },
  }, {
    indexes: [
      // I7: cel mult o licitație nefinalizată pentru un obiect
      { name: "auctions_one_open_per_item", unique: true, fields: ["itemId"], where: { status: OPEN_AUCTION_STATUSES } },
      { name: "auctions_status_ends_at", fields: ["status", "endsAt"] },
    ],
    validate: {
      endsAfterStart() {
        if (this.startsAt && this.endsAt && new Date(this.endsAt) <= new Date(this.startsAt)) {
          throw new Error("endsAt trebuie să fie după startsAt.");
        }
      },
      outcomeOnlyWhenEnded() {
        if ((this.status === "ENDED") !== (this.outcome !== null && this.outcome !== undefined)) {
          throw new Error("outcome este obligatoriu pentru ENDED și interzis în celelalte stări.");
        }
      },
      leaderMatchesPrice() {
        const hasLeader = this.leaderId !== null && this.leaderId !== undefined;
        const hasPrice = this.currentPrice !== null && this.currentPrice !== undefined;
        if (hasLeader !== hasPrice) throw new Error("leaderId și currentPrice se setează împreună.");
      },
    },
  });

  const Bid = sequelize.define("Bid", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    amount: { type: DataTypes.INTEGER, allowNull: false, validate: money },
    status: { type: DataTypes.STRING(10), allowNull: false, validate: oneOf(BID_STATUSES) },
    rejectReason: { type: DataTypes.STRING(40), allowNull: true },
    seq: { type: DataTypes.INTEGER, allowNull: true, validate: { isInt: true, min: 1 } },
  }, {
    updatedAt: false, // ofertele sunt imutabile; createdAt = ceasul serverului la primire
    indexes: [
      // I4: două oferte acceptate nu pot avea aceeași sumă sau același seq în aceeași licitație
      { name: "bids_accepted_amount_unique", unique: true, fields: ["auctionId", "amount"], where: { status: "ACCEPTED" } },
      { name: "bids_accepted_seq_unique", unique: true, fields: ["auctionId", "seq"], where: { status: "ACCEPTED" } },
      { name: "bids_auction_created", fields: ["auctionId", "createdAt"] },
      { name: "bids_bidder_created", fields: ["bidderId", "createdAt"] },
    ],
    validate: {
      seqOnlyForAccepted() {
        if (this.status === "ACCEPTED" && (this.seq === null || this.seq === undefined)) {
          throw new Error("O ofertă acceptată trebuie să aibă seq.");
        }
        if (this.status === "REJECTED" && this.seq !== null && this.seq !== undefined) {
          throw new Error("O ofertă respinsă nu are seq.");
        }
        if (this.status === "REJECTED" && !this.rejectReason) {
          throw new Error("O ofertă respinsă trebuie să aibă motiv.");
        }
      },
    },
  });

  const required = (name) => ({ name, allowNull: false });

  User.hasMany(Item, { as: "items", foreignKey: required("createdById"), onDelete: "RESTRICT" });
  Item.belongsTo(User, { as: "createdBy", foreignKey: required("createdById"), onDelete: "RESTRICT" });

  Item.hasMany(Auction, { as: "auctions", foreignKey: required("itemId"), onDelete: "RESTRICT" });
  Auction.belongsTo(Item, { as: "item", foreignKey: required("itemId"), onDelete: "RESTRICT" });

  User.hasMany(Auction, { as: "createdAuctions", foreignKey: required("createdById"), onDelete: "RESTRICT" });
  Auction.belongsTo(User, { as: "createdBy", foreignKey: required("createdById"), onDelete: "RESTRICT" });

  // leaderId → Users (nu → Bids), ca să evităm dependența circulară Auctions ↔ Bids.
  User.hasMany(Auction, { as: "leadingAuctions", foreignKey: { name: "leaderId", allowNull: true }, onDelete: "RESTRICT" });
  Auction.belongsTo(User, { as: "leader", foreignKey: { name: "leaderId", allowNull: true }, onDelete: "RESTRICT" });

  Auction.hasMany(Bid, { as: "bids", foreignKey: required("auctionId"), onDelete: "RESTRICT" });
  Bid.belongsTo(Auction, { as: "auction", foreignKey: required("auctionId"), onDelete: "RESTRICT" });

  User.hasMany(Bid, { as: "bids", foreignKey: required("bidderId"), onDelete: "RESTRICT" });
  Bid.belongsTo(User, { as: "bidder", foreignKey: required("bidderId"), onDelete: "RESTRICT" });

  return { User, Item, Auction, Bid };
}
