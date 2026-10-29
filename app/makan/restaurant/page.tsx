import { redirect } from "next/navigation";

// Restoran is now "Di luar" inside Ide makan. Old links and bookmarks land there.
export default function RestaurantPage() {
  redirect("/makan?mode=cari&where=luar");
}
