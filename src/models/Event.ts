import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const EventSchema = new Schema({
  name: { type: String, required: true },
  joinCode: { type: String, required: true, unique: true, index: true },
  timezone: { type: String, default: "Asia/Bangkok" },
  startAt: { type: Date, required: true },
  endAt: { type: Date, required: true },
  status: { type: String, enum: ["draft", "live", "ended", "revealed"], default: "draft", index: true },
  adminIds: { type: [String], default: [] },
  settings: { allowRetake: { type: Boolean, default: true } },
  createdAt: { type: Date, default: () => new Date() },
});

export type EventDoc = InferSchemaType<typeof EventSchema> & { _id: import("mongoose").Types.ObjectId };
export const Event: Model<EventDoc> =
  (models.Event as Model<EventDoc>) ?? model<EventDoc>("Event", EventSchema);
