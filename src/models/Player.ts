import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const PlayerSchema = new Schema({
  eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true, index: true },
  lineUserId: { type: String, required: true },
  displayName: { type: String, default: "" },
  pictureUrl: { type: String, default: "" },
  isBotFriend: { type: Boolean, default: false },
  joinedAt: { type: Date, default: () => new Date() },
});
PlayerSchema.index({ eventId: 1, lineUserId: 1 }, { unique: true });

export type PlayerDoc = InferSchemaType<typeof PlayerSchema> & { _id: import("mongoose").Types.ObjectId };
export const Player: Model<PlayerDoc> =
  (models.Player as Model<PlayerDoc>) ?? model<PlayerDoc>("Player", PlayerSchema);
