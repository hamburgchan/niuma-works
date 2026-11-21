import { redirect } from "next/navigation";
import { DEMO_CHARACTERS } from "~~/utils/niuma";

export default function Page() {
  redirect(`/play/${DEMO_CHARACTERS[0]}`);
}
