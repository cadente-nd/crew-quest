import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const SubmissionSchema = new Schema({
  eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true, index: true },
  topicId: { type: Schema.Types.ObjectId, ref: "Topic", required: true },
  playerId: { type: Schema.Types.ObjectId, ref: "Player", required: true },
  lineUserId: { type: String, required: true },
  mediaType: { type: String, default: "image" }, // future: "video"
  imageUrl: { type: String, required: true },
  thumbnailUrl: { type: String, required: true },
  capturedAt: { type: Date, required: true },
  createdAt: { type: Date, default: () => new Date() },
});
SubmissionSchema.index({ topicId: 1, playerId: 1 }, { unique: true });

export type SubmissionDoc = InferSchemaType<typeof SubmissionSchema> & { _id: import("mongoose").Types.ObjectId };
export const Submission: Model<SubmissionDoc> =
  (models.Submission as Model<SubmissionDoc>) ?? model<SubmissionDoc>("Submission", SubmissionSchema);
