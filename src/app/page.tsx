import { AppShell } from "@/components/layout/AppShell";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { UploadLanding } from "@/components/upload/UploadLanding";

export default function HomePage() {
  return (
    <AppShell sidebar={<Sidebar />}>
      <UploadLanding />
    </AppShell>
  );
}
