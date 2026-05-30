import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const TopicSchema = new Schema({
  eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true, index: true },
  title: { type: String, required: true },
  description: { type: String },
  scheduledAt: { type: Date, required: true },
  closeAt: { type: Date, required: true }, // = scheduledAt + windowMinutes
  windowMinutes: { type: Number, default: 30 },
  status: { type: String, enum: ["scheduled", "open", "closed"], default: "scheduled", index: true },
  pushSentAt: { type: Date, default: null },
  order: { type: Number, default: 0 },
});
TopicSchema.index({ eventId: 1, scheduledAt: 1 });

export type TopicDoc = InferSchemaType<typeof TopicSchema> & { _id: import("mongoose").Types.ObjectId };
export const Topic: Model<TopicDoc> =
  (models.Topic as Model<TopicDoc>) ?? model<TopicDoc>("Topic", TopicSchema);
