import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const PushLogSchema = new Schema({
  eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true },
  topicId: { type: Schema.Types.ObjectId, ref: "Topic", required: true },
  type: { type: String, default: "topic_open" },
  sentAt: { type: Date, default: () => new Date() },
  success: { type: Boolean, default: true },
  error: { type: String },
});

export type PushLogDoc = InferSchemaType<typeof PushLogSchema> & { _id: import("mongoose").Types.ObjectId };
export const PushLog: Model<PushLogDoc> =
  (models.PushLog as Model<PushLogDoc>) ?? model<PushLogDoc>("PushLog", PushLogSchema);
