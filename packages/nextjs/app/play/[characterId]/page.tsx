import { redirect } from "next/navigation";
import { PlayClient } from "~~/components/game/PlayClient";
import { DEMO_CHARACTERS } from "~~/utils/niuma";

export default async function PlayPage({ params }: { params: Promise<{ characterId: string }> }) {
  const { characterId } = await params;
  if (!DEMO_CHARACTERS.includes(Number(characterId))) redirect(`/play/${DEMO_CHARACTERS[0]}`);
  return <PlayClient characterId={Number(characterId)} />;
}
