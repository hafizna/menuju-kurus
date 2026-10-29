import { redirect } from "next/navigation";

// Restoran was removed; Ide makan is the one place for meal ideas.
// Old links and bookmarks land there.
export default function RestaurantPage() {
  redirect("/makan?mode=cari");
}
