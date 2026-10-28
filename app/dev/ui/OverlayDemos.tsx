"use client";

import toast from "react-hot-toast";
import { Ellipsis, Info, Menu, Pencil, Trash2, UserCheck } from "lucide-react";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const STATUS_OPTIONS = [
  { value: "all", label: "Semua status" },
  { value: "waiting", label: "Waiting" },
  { value: "on_progress", label: "On Progress" },
  { value: "done", label: "Done" },
];

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Everything on /dev/ui that needs the browser: overlays, menus, toasts. */
export function OverlayDemos() {
  return (
    <TooltipProvider>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 md:p-5">
          <h3 className="text-sm font-semibold text-foreground">Dialog dan ConfirmDialog</h3>
          <div className="flex flex-wrap gap-2">
            <Dialog>
              <DialogTrigger render={<Button variant="outline" />}>
                <Pencil aria-hidden="true" />
                Ubah catatan
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-lg font-semibold">Ubah catatan</DialogTitle>
                  <DialogDescription>Catatan ini hanya terlihat oleh staf.</DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="demo-note">Catatan</Label>
                  <Input id="demo-note" defaultValue="Unit masuk tanpa charger" />
                </div>
                <DialogFooter>
                  <DialogClose render={<Button variant="outline" />}>Batal</DialogClose>
                  <DialogClose render={<Button />} onClick={() => toast.success("Catatan disimpan")}>
                    Simpan
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <ConfirmDialog
              trigger={<Button variant="destructive" />}
              triggerLabel={
                <>
                  <Trash2 aria-hidden="true" />
                  Hapus tiket
                </>
              }
              title="Hapus tiket NGW-000043?"
              description="Tiket, lampiran, dan riwayat statusnya ikut terhapus. Ini tidak bisa dibatalkan."
              confirmLabel="Hapus"
              variant="destructive"
              onConfirm={async () => {
                await wait(900);
                toast.success("Tiket dihapus (contoh)");
              }}
            />

            <ConfirmDialog
              trigger={<Button variant="outline" />}
              triggerLabel="Konfirmasi yang gagal"
              title="Setujui permintaan?"
              description="Contoh aksi server yang menolak: pesan errornya tampil di dialog, dialog tetap terbuka."
              confirmLabel="Setujui"
              onConfirm={async () => {
                await wait(700);
                throw new Error("Tiket sudah diambil teknisi lain.");
              }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 md:p-5">
          <h3 className="text-sm font-semibold text-foreground">Menu, Sheet, Tooltip</h3>
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="Aksi tiket" />}>
                <Ellipsis aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Tiket NGW-000043</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => toast.success("Teknisi ditugaskan (contoh)")}>
                    <UserCheck aria-hidden="true" />
                    Tugaskan teknisi
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Pencil aria-hidden="true" />
                    Ubah
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive">
                  <Trash2 aria-hidden="true" />
                  Hapus
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Sheet>
              <SheetTrigger render={<Button variant="outline" />}>
                <Menu aria-hidden="true" />
                Menu (Sheet)
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-4">
                <SheetHeader className="p-0">
                  <SheetTitle>HNS Service Center</SheetTitle>
                  <SheetDescription>Sidebar di HP akan memakai Sheet ini (Phase 2).</SheetDescription>
                </SheetHeader>
                <nav aria-label="Contoh menu" className="flex flex-col gap-1">
                  {["Dashboard", "Semua Tiket", "Buat Tiket", "Leaderboard"].map((item, i) => (
                    <a
                      key={item}
                      href="#"
                      aria-current={i === 0 ? "page" : undefined}
                      className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:bg-secondary aria-[current=page]:text-primary"
                    >
                      {item}
                    </a>
                  ))}
                </nav>
              </SheetContent>
            </Sheet>

            <Tooltip>
              <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label="Apa itu SLA?" />}>
                <Info aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent>Batas hari sebuah klaim boleh diam di satu tahap.</TooltipContent>
            </Tooltip>

            <Button variant="secondary" onClick={() => toast.success("Status diperbarui")}>
              Toast sukses
            </Button>
            <Button variant="outline" onClick={() => toast.error("Ukuran file melebihi 9 MB")}>
              Toast error
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 md:p-5">
          <h3 className="text-sm font-semibold text-foreground">Select dan Tabs</h3>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="demo-status">Status</Label>
            <Select items={STATUS_OPTIONS} defaultValue="all" name="status">
              <SelectTrigger id="demo-status" className="w-full bg-card md:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Tabs defaultValue="aktif">
            <TabsList>
              <TabsTrigger value="aktif">Aktif</TabsTrigger>
              <TabsTrigger value="selesai">Selesai</TabsTrigger>
              <TabsTrigger value="semua">Semua</TabsTrigger>
            </TabsList>
            <TabsContent value="aktif" className="pt-2 text-sm text-muted-foreground">
              12 tiket sedang dikerjakan.
            </TabsContent>
            <TabsContent value="selesai" className="pt-2 text-sm text-muted-foreground">
              38 tiket selesai bulan ini.
            </TabsContent>
            <TabsContent value="semua" className="pt-2 text-sm text-muted-foreground">
              134 tiket.
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 md:p-5">
          <h3 className="text-sm font-semibold text-foreground">Avatar</h3>
          <div className="flex items-center gap-3">
            {["Budi Santoso", "Siti Aminah", "Agus Salim"].map((name) => (
              <div key={name} className="flex items-center gap-2">
                <Avatar>
                  <AvatarFallback className="bg-secondary font-semibold text-primary">
                    {name
                      .split(" ")
                      .map((w) => w[0])
                      .join("")}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden text-sm text-foreground sm:inline">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
