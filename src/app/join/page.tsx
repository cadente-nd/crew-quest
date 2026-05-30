import { JoinForm } from "@/components/player/JoinForm";

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const { event } = await searchParams;
  return <JoinForm initialCode={event} />;
}
