import { useMemo, useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Ticket, Loader2, CheckCircle2, Upload, X, Mail, ExternalLink, Copy } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import NumberButton, { NumberStatus } from "@/components/rifa/NumberButton";
import { supabase } from "@/lib/supabase";

const TOTAL = 500;
const PRICE = 10;
const PIX_KEY = "a4e37a34-0e86-41f0-8623-d68f0120c0a8";

// Interface para os prêmios (Adicionado para suportar banco de dados)
interface PrizeItem {
  id: string;
  titulo: string;
  descricao: string;
  url_apoiador: string;
  url_imagem: string;
  ativo: boolean;
}

const formSchema = z.object({
  name: z.string().trim().min(3, "Informe seu nome completo").max(100),
  email: z.string().trim().email("E-mail inválido"),
  whatsapp: z
    .string()
    .trim()
    .min(11, "WhatsApp deve ter 11 dígitos (DDD + número)")
    .max(11, "WhatsApp deve ter 11 dígitos (DDD + número)")
    .regex(/^\d+$/, "Use apenas números"),
});

interface RifaNumero {
  numero_rifa: number;
  status_numero: 'livre' | 'reservado' | 'comprado';
  nome_comprador: string | null;
  whats_comprador: string | null;
  reservado_ate: string | null;
}

const Rifa = () => {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [rifaNumbers, setRifaNumbers] = useState<Map<number, RifaNumero>>(new Map());
  const [loadingNumbers, setLoadingNumbers] = useState(true);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastOrder, setLastOrder] = useState<any>(null);

  // Estados para prêmios dinâmicos
  const [prizes, setPrizes] = useState<PrizeItem[]>([]);
  const [loadingPrizes, setLoadingPrizes] = useState(true);

  // Função para buscar prêmios (Nova)
  const fetchPrizes = useCallback(async () => {
    setLoadingPrizes(true);
    try {
      const { data, error } = await supabase
        .from("rifa_premios")
        .select("*")
        .eq("ativo", true)
        .order("created_at", { ascending: true });
      if (!error && data) setPrizes(data);
    } catch (error) {
      console.error("Erro ao buscar prêmios:", error);
    } finally {
      setLoadingPrizes(false);
    }
  }, []);

  const fetchRifaNumbers = useCallback(async () => {
    setLoadingNumbers(true);
    try {
      // REMOVIDO: A lógica de expiração automática para tornar o processo manual
      
      const { data, error } = await supabase
        .from("rifa_numeros")
        .select("numero_rifa, status_numero, nome_comprador, whats_comprador, reservado_ate");
      
      if (error) throw error;

      const map = new Map();
      data?.forEach(num => map.set(num.numero_rifa, num));
      setRifaNumbers(map);
    } catch (error) {
      console.error("Erro ao buscar números da rifa:", error);
      toast({ title: "Erro ao carregar números", description: "Tente novamente mais tarde.", variant: "destructive" });
    } finally {
      setLoadingNumbers(false);
    }
  }, []);

  useEffect(() => {
    fetchRifaNumbers();
    fetchPrizes(); // Chama a busca de prêmios
  }, [fetchRifaNumbers, fetchPrizes]);

  const toggle = (n: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(n) ? next.delete(n) : next.add(n);
      return next;
    });
  };

  const total = selected.size * PRICE;
  
  const getStatus = (n: number): NumberStatus => {
    if (selected.has(n)) return "selected";
    const rifaNumber = rifaNumbers.get(n);
    if (!rifaNumber) return "free";
    switch (rifaNumber.status_numero) {
      case "reservado": return "reserved";
      case "comprado": return "paid";
      default: return "free";
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setProofFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selected.size === 0) {
      toast({ title: "Selecione ao menos um número", variant: "destructive" });
      return;
    }

    if (!proofFile) {
      toast({ title: "Anexe o comprovante", description: "É necessário enviar a foto do comprovante PIX.", variant: "destructive" });
      return;
    }

    const parsed = formSchema.safeParse({ name, email, whatsapp });
    if (!parsed.success) {
      toast({ title: "Verifique os dados", description: parsed.error.issues[0].message, variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const sortedNumbers = Array.from(selected).sort((a, b) => a - b);
      // REMOVIDO: expirationDate para ser manual

      const fileExt = proofFile.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('comprovantes')
        .upload(fileName, proofFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('comprovantes')
        .getPublicUrl(fileName);

      const { data: order, error: orderError } = await supabase
        .from("rifa_pedidos")
        .insert({
          nome_comprador: parsed.data.name,
          email_comprador: parsed.data.email,
          whats_comprador: parsed.data.whatsapp,
          numeros_selecionados: sortedNumbers,
          valor_total: total,
          status_pagamento: "pendente",
          url_comprovante: publicUrl,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      const { error: updateError } = await supabase
        .from("rifa_numeros")
        .update({
          status_numero: "reservado",
          nome_comprador: parsed.data.name,
          whats_comprador: parsed.data.whatsapp,
          // reservado_ate removido para controle manual
          id_pedido: order.id,
        })
        .in("numero_rifa", sortedNumbers);

      if (updateError) throw updateError;

      // Disparar e-mail de reserva via Vercel
      try {
        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: parsed.data.email,
            subject: "Reserva Confirmada - Rifa TDS",
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
                <h2 style="color: #ef4444; text-align: center;">RESERVA CONFIRMADA! 🎟️</h2>
                <p>Olá <strong>${parsed.data.name}</strong>,</p>
                <p>Sua reserva na Rifa TDS foi realizada com sucesso! Agora nossa equipe vai conferir o seu pagamento.</p>
                <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin: 20px 0;">
                  <p><strong>Seus Números:</strong> <span style="font-size: 18px; color: #ef4444;">${sortedNumbers.join(', ')}</span></p>
                  <p><strong>Valor Total:</strong> R$ ${total.toFixed(2).replace('.', ',')}</p>
                </div>
                <p>Assim que o pagamento for aprovado, você receberá um novo e-mail de confirmação.</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="text-align: center; font-size: 10px; color: #999;">Templo do Som - Faça parte disso.</p>
              </div>
            `
          })
        });
      } catch (e) { console.error("Erro ao disparar e-mail:", e); }

      setLastOrder({
        id: order.id,
        name: parsed.data.name,
        email: parsed.data.email,
        numbers: sortedNumbers,
        total: total,
        date: new Date().toLocaleString('pt-BR')
      });

      setShowSuccessModal(true);
      
      setSelected(new Set());
      setName("");
      setEmail("");
      setWhatsapp("");
      setProofFile(null);
      fetchRifaNumbers();

    } catch (error: any) {
      console.error("Erro inesperado:", error);
      toast({ title: "Ocorreu um erro", description: error.message || "Tente novamente.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const numbersToDisplay = useMemo(() => Array.from({ length: TOTAL }, (_, i) => i + 1), []);

  return (
    <div className="min-h-screen bg-grid-grunge text-foreground">
      {/* Hero Section */}
      <section className="relative h-screen overflow-hidden">
        <video autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover -z-10">
          <source src="/videos/VIDEO.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-[rgba(0,0,10,0.7)] -z-5"></div>
        <div className="relative z-10 flex flex-col items-center justify-center h-full px-4 text-center">
          <div className="splatter relative mb-8">
            <img src="/img/TDS_logo_sem_fundo.png" alt="Logo Templo do Som" className="h-48 md:h-64 mx-auto drop-shadow-[0_10px_30px_hsl(var(--tds-red)/0.5)] logo-float" />
          </div>
          <h1 className="font-display text-6xl md:text-8xl text-white text-spray uppercase mb-4 animate-fade-in-up">Templo do Som</h1>
          <p className="font-marker text-2xl md:text-3xl text-white mb-2 animate-fade-in-up animation-delay-200">Faça parte disso.</p>
          <p className="max-w-xl text-white/90 text-lg animate-fade-in-up animation-delay-400">Participe da nossa rifa e ajude a fortalecer as batalhas, melhorar a estrutura dos eventos e manter a cultura viva. Cada número faz diferença no crescimento da TDS.</p>
        </div>
      </section>

      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-background/70 border-b border-primary/30">
        <div className="container flex items-center justify-between py-3">
          <Button asChild variant="ghost" size="sm" className="font-display tracking-wider text-base hover:text-primary">
            <Link to="/"><ArrowLeft className="mr-2 h-4 w-4" />Voltar para TDS</Link>
          </Button>
          <div className="flex items-center gap-2 text-primary font-marker text-sm"><Ticket className="h-4 w-4" />RIFA OFICIAL</div>
        </div>
      </header>

      {/* SEÇÃO DE PREMIAÇÕES (MODIFICADA PARA DINÂMICA) */}
      <section className="container py-12">
        <div className="mb-10 text-center">
          <h2 className="font-display text-5xl text-primary uppercase tracking-tighter">Premiações</h2>
          <div className="h-1 w-24 bg-primary mx-auto mt-2"></div>
          <p className="mt-4 max-w-2xl mx-auto text-muted-foreground">Cada prêmio foi doado por um apoiador da cena. Conheça e apoie quem fortalece as batalhas.</p>
        </div>
        
        {loadingPrizes ? (
          <div className="flex flex-col justify-center items-center h-32 space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-primary font-display text-lg uppercase tracking-widest">Carregando prêmios...</span>
          </div>
        ) : prizes.length === 0 ? (
          <div className="text-center text-muted-foreground">Nenhum prêmio disponível no momento.</div>
        ) : (
          <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {prizes.map((item) => (
              <article key={item.id} className="overflow-hidden rounded-3xl border border-border bg-card shadow-2xl transition-transform hover:scale-[1.02]">
                <div className="relative overflow-hidden bg-[radial-gradient(circle_at_top,_hsl(var(--tds-red)/0.15),transparent_60%)]">
                  <img src={item.url_imagem} alt={item.titulo} className="w-full h-40 object-contain p-6 bg-background/50" />
                </div>
                <div className="p-5 space-y-3 text-left">
                  <h3 className="font-display text-xl text-primary">{item.titulo}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.descricao}</p>
                  {item.url_apoiador && (
                    <a href={item.url_apoiador} target="_blank" rel="noreferrer noopener" className="inline-flex w-full items-center justify-center rounded-full bg-primary px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-primary-foreground hover:bg-primary/90 transition-colors">Ver apoiador</a>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Legenda (MANTIDA IGUAL AO ORIGINAL) */}
      <section className="container mb-8">
        <div className="flex flex-wrap items-center justify-center gap-6 text-sm font-bold uppercase tracking-widest">
          <Legend color="bg-[#1a1f2e]" label="Livre" />
          <Legend color="bg-[#10b981]" label="Selecionado" />
          <Legend color="bg-[#f59e0b]" label="Reservado" />
          <Legend color="bg-[#ef4444]" label="Pago" />
        </div>
      </section>

      {/* Layout principal */}
      <section className="container pb-24 grid lg:grid-cols-[1fr_380px] gap-10">
        <div className="bg-card/40 backdrop-blur-sm border-2 border-border rounded-2xl p-4 md:p-8 shadow-2xl">
          {loadingNumbers ? (
            <div className="flex flex-col justify-center items-center h-64 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <span className="text-primary font-display text-xl uppercase tracking-widest">Carregando números...</span>
            </div>
          ) : (
            <div className="grid gap-2 md:gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(45px, 1fr))" }}>
              {numbersToDisplay.map((n) => (
                <NumberButton key={n} number={n} status={getStatus(n)} onToggle={toggle} />
              ))}
            </div>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 self-start space-y-6">
          <div className="bg-card border-2 border-primary/40 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-transparent via-primary to-transparent"></div>
            <h2 className="font-display text-3xl text-primary mb-6 uppercase tracking-tighter">Resumo</h2>
            <div className="space-y-4 mb-8">
              <div className="flex justify-between items-center"><span className="text-muted-foreground font-medium">Números selecionados</span><span className="font-bold text-foreground text-lg">{selected.size}</span></div>
              <div className="flex justify-between items-center"><span className="text-muted-foreground font-medium">Valor unitário</span><span className="font-bold text-foreground text-lg">R$ 10,00</span></div>
              <div className="h-px bg-border my-4" />
              <div className="flex justify-between items-center"><span className="text-muted-foreground font-bold uppercase tracking-widest">Total</span><span className="font-bold text-primary text-3xl">R$ {total.toFixed(2).replace(".", ",")}</span></div>
            </div>
            
            <div className="p-4 bg-muted/30 rounded-xl border border-border mb-6">
              <p className="text-xs font-bold text-primary uppercase mb-2 tracking-widest">Chave PIX para Pagamento:</p>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-mono font-bold break-all text-foreground">{PIX_KEY}</p>
                <button onClick={() => { navigator.clipboard.writeText(PIX_KEY); toast({ title: "Chave PIX copiada!" }); }} className="p-2.5 bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors shrink-0"><Copy className="h-4 w-4 text-primary" /></button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome Completo</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" className="bg-background/50" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" className="bg-background/50" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="whatsapp">WhatsApp (DDD + Número)</Label>
                <Input id="whatsapp" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="11999999999" className="bg-background/50" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="proof">Comprovante PIX (Foto/PDF)</Label>
                <div className="relative">
                  <input type="file" id="proof" onChange={handleFileChange} accept="image/*,.pdf" className="hidden" />
                  <Button asChild variant="outline" className="w-full cursor-pointer bg-background/50 border-dashed border-2 hover:border-primary/50">
                    <label htmlFor="proof">
                      {proofFile ? <><CheckCircle2 className="mr-2 h-4 w-4 text-green-500" /> {proofFile.name}</> : <><Upload className="mr-2 h-4 w-4" /> Selecionar Arquivo</>}
                    </label>
                  </Button>
                </div>
              </div>
              <Button type="submit" className="w-full h-14 text-lg font-display uppercase tracking-widest" disabled={submitting}>
                {submitting ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Processando...</> : "Finalizar Reserva"}
              </Button>
            </form>
          </div>
        </aside>
      </section>

      {/* Success Modal (MANTIDO IGUAL AO ORIGINAL) */}
      {showSuccessModal && lastOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-card border-2 border-primary/50 rounded-3xl p-8 max-w-md w-full shadow-[0_0_50px_rgba(239,68,68,0.3)] relative">
            <button onClick={() => setShowSuccessModal(false)} className="absolute top-4 right-4 p-2 hover:bg-muted rounded-full transition-colors"><X className="h-6 w-6" /></button>
            <div className="text-center space-y-6">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-green-500/10 rounded-full mb-2"><CheckCircle2 className="h-10 w-10 text-green-500" /></div>
              <h2 className="font-display text-4xl text-primary uppercase tracking-tighter">Reserva Realizada!</h2>
              <p className="text-muted-foreground">Sua reserva foi enviada com sucesso. Nossa equipe conferirá o comprovante e você receberá um e-mail de confirmação em breve.</p>
              <div className="bg-muted/50 rounded-2xl p-6 text-left space-y-3 border border-border">
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Comprador:</span><span className="font-bold">{lastOrder.name}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Números:</span><span className="font-bold text-primary">{lastOrder.numbers.join(', ')}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total:</span><span className="font-bold">R$ {lastOrder.total.toFixed(2).replace('.', ',')}</span></div>
              </div>
              <Button onClick={() => setShowSuccessModal(false)} className="w-full h-12 rounded-full font-bold uppercase tracking-widest">Entendido</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Componente Legend (MANTIDO)
const Legend = ({ color, label }: { color: string; label: string }) => (
  <div className="flex items-center gap-2">
    <div className={`w-4 h-4 rounded-full ${color} shadow-lg shadow-black/20`}></div>
    <span className="text-muted-foreground">{label}</span>
  </div>
);

export default Rifa;
