import { redirect } from "next/navigation";
import { PlayClient } from "~~/components/game/PlayClient";

export default async function PlayPage({ params }: { params: Promise<{ characterId: string }> }) {
  const { characterId } = await params;
  if (characterId === "1") redirect("/play/4");
  if (!/^[1-9][0-9]{0,10}$/.test(characterId)) redirect("/play/4");
  return <PlayClient characterId={Number(characterId)} />;
}
