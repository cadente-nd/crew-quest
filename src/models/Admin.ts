import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const AdminSchema = new Schema({
  lineUserId: { type: String, required: true, unique: true, index: true },
  displayName: { type: String, default: "" },
  createdAt: { type: Date, default: () => new Date() },
});

export type AdminDoc = InferSchemaType<typeof AdminSchema> & { _id: import("mongoose").Types.ObjectId };
export const Admin: Model<AdminDoc> =
  (models.Admin as Model<AdminDoc>) ?? model<AdminDoc>("Admin", AdminSchema);
