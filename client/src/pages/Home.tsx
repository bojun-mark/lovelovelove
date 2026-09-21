import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Compass, Crown, Gem, Mail, MapPin, Orbit, Sparkles, Star, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { BirthplaceSelect } from "@/components/BirthplaceSelect";
import { resolveBirthMoment } from "@shared/birthplaces";

type FormState = { nickname: string; year: string; month: string; day: string; time: string; place: string; email: string };
const initialForm: FormState = { nickname: "", year: "", month: "", day: "", time: "", place: "", email: "" };
const colors = [
  { name: "深邃宇宙紫", hex: "#8b5cf6", note: "洞察與轉化" },
  { name: "沉穩大地棕", hex: "#9a6b4d", note: "安定與界線" },
  { name: "耀眼曙光金", hex: "#e8b86a", note: "豐盛與顯化" },
  { name: "寧靜海洋藍", hex: "#4d8fa7", note: "流動與直覺" },
  { name: "熱情赤焰紅", hex: "#db5d5d", note: "行動與渴望" },
  { name: "純粹極光綠", hex: "#62b895", note: "療癒與更新" },
];
const states = [
  "時間不夠用，生活卻像一池死水", "面對重大決定時，經常反覆內耗", "付出與得到的回饋總是不成正比", "夜深人靜時，會莫名感到焦慮", "人際關係讓你逐漸感到無力", "在維持現狀與勇敢改變之間拉扯", "你的才華好像被目前環境埋沒", "對未來有方向，卻又不安而迷茫", "常常因為別人的眼光壓抑真正的自己", "此刻最渴望的是財富突破或情感歸屬" 
];
const categories = [
  { id: "love", icon: "🌹", title: "感情與人際", desc: "看見關係裡的磁場與界線", questions: ["我與某段關係還有繼續的可能嗎？", "今年會遇見適合我的人嗎？", "為什麼我總是在關係裡過度付出？", "如何改善反覆出現的人際模式？", "我真正需要的情感歸屬是什麼？"] },
  { id: "work", icon: "💼", title: "事業與財富", desc: "拆解停滯，找到顯化突破點", questions: ["工作該繼續撐下去，還是立刻換？", "今年財運突破點在哪裡？", "我的能力適合發展哪一種副業？", "如何走出收入停滯的循環？", "目前的選擇是否值得長期投入？"] },
  { id: "future", icon: "🧭", title: "未來與方向", desc: "為下一個人生章節校準座標", questions: ["接下來三個月最重要的轉折是什麼？", "我目前的人生方向走對了嗎？", "什麼時候適合做出重大改變？", "我的天賦真正適合放在哪裡？", "如何找到下一個人生突破口？"] },
];
const plans = [
  { id: "basic", icon: "🥉", price: 99, name: "基礎啟示版", copy: "色彩密碼 + 當下心靈盲點短評", items: ["色彩密碼", "當下心靈盲點短評"] },
  { id: "plus", icon: "🥈", price: 199, name: "進階解惑版", copy: "十大內心盲點全面剖析 + 核心困惑深度解析", popular: true, items: ["包含基礎啟示版", "10 大內心盲點全面剖析", "核心困惑深度解析"] },
  { id: "full", icon: "🥇", price: 299, name: "尊榮完整版", copy: "90 天行動指南 + 未來三個月運勢轉折與靈魂箴言", items: ["包含進階解惑版", "90 天行動指南", "未來三個月運勢轉折", "專屬靈魂箴言"] },
];

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <label className="field"><span className="field-label">{icon}{label}</span>{children}</label>;
}
function OrbitalMark() { return <span className="orbital-mark"><Orbit size={22} strokeWidth={1.5} /></span>; }
function Progress({ step }: { step: number }) { return <div className="progress-wrap"><div className="progress-meta"><span>旅程進度</span><span>{String(step).padStart(2, "0")} / 05</span></div><div className="progress-track"><span style={{ width: `${(step / 5) * 100}%` }} /></div></div>; }
const answerLabels = ["非常貼近我現在的狀態", "偶爾會有這種感覺", "還不太確定"];
const reportLoadingMessages = ["正在讀取你的靈魂色彩...", "把十個狀態放回同一片星圖...", "正在靠近你真正想問的那句話...", "整理那些還沒有被說出口的感受...", "你的專屬解讀即將抵達。"];
function buildSoulReport(nickname: string, pickedColors: string[], selectedCategory: typeof categories[number] | undefined, subQuestion: string | null, answers: Record<number, number>) {
  const colorText = pickedColors.join("與");
  const categoryText = selectedCategory?.title ?? "你此刻最在意的方向";
  const questionText = subQuestion ?? "此刻最想解開的問題";
  const closeStates = states.filter((_, index) => answers[index] === 0).slice(0, 4);
  const stateText = closeStates.length ? closeStates.join("、") : "對未來的不安與反覆思考";
  return `嗨，${nickname}。\n\n先說在前面：這不是一份替你下定論的報告，也不是把你塞進某一種人格分類。你選下的顏色、你在十個問題裡停留的地方，反而比較像是你最近生活留下的腳印。它們告訴我們的，不是「你就是怎樣的人」，而是你正站在哪裡、哪裡開始累了，以及哪一個問題已經在心裡敲門敲了很久。\n\n你憑直覺留下的色彩是 ${colorText}。這兩個顏色放在一起，很像一個正在努力維持清醒、卻也渴望有人替自己把燈打開的人。你可能不是沒有答案，而是太習慣在做決定之前，把所有人的感受、所有可能的後果、甚至還沒發生的失敗都先算一遍。久而久之，真正的心意反而被放在最後面。這也是為什麼有些時候你明明知道自己不想再繼續，卻還是會說「再等等看」；不是你軟弱，而是你太明白離開之後要重新整理多少東西。\n\n在十個狀態裡，你特別靠近的是：${stateText}。這幾個答案合在一起，透露的不是你不夠努力，反而是你已經努力了相當長的一段時間。你正在承受的，可能不是單一事件，而是一種「我明明一直有在做，為什麼生活還是沒有往前」的疲憊。這種疲憊最容易被忽略，因為外人看見的往往是你還能工作、還能回訊息、還能把事情完成；只有你自己知道，很多晚上其實只是把今天撐過去，並沒有真的休息。\n\n你現在真正想問的是：「${questionText}」。這個問題的重量，通常不只在問題本身。你想知道的也許不是一個單純的答案，而是希望有人幫你確認：如果我選擇自己，我是不是太自私？如果我不再配合所有人的期待，我是不是會失去重要的人？如果我換一條路，會不會證明過去的努力都白費了？所以接下來的分析，不會替你宣布一個命運結果，而是陪你把問題拆開，找到你其實已經知道、卻還沒有允許自己承認的部分。\n\n先看你與這件事的關係。你很可能已經累積了不少觀察，只是一直缺少一個可以放心說出口的時刻。你會在意細節，也會記得別人一句無心的話；表面上你似乎很能體諒，但心裡其實有一條界線，一旦被反覆踩過，就會從失望變成安靜。你不是突然改變，而是早就把失望分成很多次吞下去了。這份報告想提醒你的是：不要只在事情爆炸之後，才承認自己早就不舒服。你可以在還沒有翻桌以前，就先替自己說一句「這樣的安排我不想要」。\n\n如果這個問題涉及工作、金錢或未來選擇，請暫時不要逼自己做一個漂亮的決定。先問三件很實際的事：我留下，是因為真的還有值得投入的空間，還是因為害怕重新開始？我想要的回饋，究竟是收入、肯定、自由，還是被看見？如果接下來三個月什麼都不改，我願意承受現在的生活嗎？答案不需要立刻變成行動，但它會讓你看見自己正在交換什麼。很多卡住的人不是沒有能力，而是一直用未來的希望，補貼現在已經失衡的生活。\n\n如果這個問題牽涉感情或人際，請記住：理解別人和放棄自己，從來不是同一件事。你可以溫柔，但不必隨時可得；你可以在乎，但不必用過度付出來證明自己值得被留下。真正穩定的關係，不會要求你每次都先委屈自己才換來和平。當你開始說清楚需求，某些關係也許會短暫不習慣，但那正好能幫你分辨，對方愛的是你，還是愛一個永遠配合的你。\n\n給你的三個小練習是：第一，這一週記下三次「我其實想說，但最後沒有說出口」的時刻；第二，挑一件最小的事，做一個不需要向任何人解釋的選擇；第三，把你最擔心的結果寫下來，再問自己，真的發生時我有哪些資源可以處理。你會發現，恐懼之所以巨大，常常是因為它一直停留在腦中，沒有被放到紙上看清楚。\n\n最後，我想把一句比較不華麗、但很重要的話留給你：你不需要等到完全不害怕，才有資格往前走。你也不需要先證明自己已經準備好，才可以拒絕一條讓你越走越小的路。現在的你或許還在整理，但整理本身就是一種前進。請把這份文字當成一面鏡子，不是判決書。真正的答案，會在你下一次願意尊重自己的選擇時，慢慢變得清楚。`;
}

export default function Home() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(initialForm);
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [pickedColors, setPickedColors] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [category, setCategory] = useState<string | null>(null);
  const [subQuestion, setSubQuestion] = useState<string | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  const [showFullReport, setShowFullReport] = useState(false);
  const [aiReport, setAiReport] = useState("");
  const [activeReportSection, setActiveReportSection] = useState<number | null>(null);
  const [reportProgress, setReportProgress] = useState(0);
  const [savedReportPosition, setSavedReportPosition] = useState(0);
  const [showContinuePrompt, setShowContinuePrompt] = useState(false);
  const [reportError, setReportError] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [paymentReturn, setPaymentReturn] = useState(false);
  const [verifiedSessionId, setVerifiedSessionId] = useState<number | null>(null);
  const [birthChart, setBirthChart] = useState<any>(null);
  const [checkoutRedirecting, setCheckoutRedirecting] = useState(false);
  const saveSession = trpc.starLove.saveSession.useMutation();
  const createCheckout = trpc.starLove.createCheckout.useMutation();
  const generateReport = trpc.starLove.generateReport.useMutation();
  const verifyPayment = trpc.starLove.verifyPayment.useMutation();
  const reportPositionKey = "starlovelab-report-position";
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    const sessionId = params.get("session_id");
    if (payment === "success" && sessionId) {
      setPaymentReturn(true);
      void (async () => {
        try {
          const result = await verifyPayment.mutateAsync({ sessionId });
          const saved = result.session;
          setForm({ nickname: saved.nickname, year: saved.year, month: saved.month, day: saved.day, time: saved.time, place: saved.place, email: saved.email });
          setPickedColors(saved.colors); setAnswers(Object.fromEntries(saved.answers.map((value: number, index: number) => [index, value])));
          setCategory(categories.find(item => item.title === saved.category)?.id ?? null);
          setSubQuestion(saved.subQuestion); setPlan(plans.find(item => item.name === saved.plan)?.id ?? null); setVerifiedSessionId(saved.id); setBirthChart(result.chart); setPaid(true);
          window.localStorage.removeItem("starlovelab-checkout-state");
          window.history.replaceState({}, "", window.location.pathname);
        } catch (error) {
          setPaid(false); setPaymentReturn(false);
          toast.error(error instanceof Error ? error.message : "付款驗證失敗，請稍後重試");
        }
      })();
    } else if (payment === "cancelled") {
      toast.info("付款尚未完成，你可以重新選擇方案。");
      window.history.replaceState({}, "", window.location.pathname);
    }
    const stored = Number(window.localStorage.getItem(reportPositionKey) ?? 0);
    if (Number.isFinite(stored) && stored > 0) setSavedReportPosition(stored);
  }, []);
  useEffect(() => {
    if (!paid || !showFullReport || savedReportPosition <= 0) {
      setShowContinuePrompt(false);
      return;
    }
    setShowContinuePrompt(true);
    const timer = window.setTimeout(() => setShowContinuePrompt(false), 5200);
    return () => window.clearTimeout(timer);
  }, [paid, showFullReport]);
  useEffect(() => {
    if (!generateReport.isPending) {
      setLoadingMessageIndex(0);
      return;
    }
    const timer = window.setInterval(() => setLoadingMessageIndex((current) => (current + 1) % reportLoadingMessages.length), 2200);
    return () => window.clearInterval(timer);
  }, [generateReport.isPending]);
  useEffect(() => {
    if (!paid || !showFullReport || !aiReport) {
      setActiveReportSection(null);
      setReportProgress(0);
      return;
    }
    const updateActiveSection = () => {
      const headings = Array.from(document.querySelectorAll<HTMLElement>(".report-section-title[id]"));
      const marker = window.scrollY + 190;
      const reportBody = document.querySelector<HTMLElement>(".report-body");
      if (reportBody) {
        const start = reportBody.offsetTop - 190;
        const end = Math.max(start + 1, reportBody.offsetTop + reportBody.offsetHeight - window.innerHeight + 190);
        const progress = Math.round(Math.min(100, Math.max(0, ((window.scrollY - start) / (end - start)) * 100)));
        setReportProgress(progress);
        if (progress < 100 && window.scrollY > start + 80) {
          window.localStorage.setItem(reportPositionKey, String(Math.round(window.scrollY)));
          setSavedReportPosition(Math.round(window.scrollY));
        } else if (progress >= 100) {
          window.localStorage.removeItem(reportPositionKey);
          setSavedReportPosition(0);
        }
      }
      let current = headings[0] ? Number(headings[0].dataset.sectionIndex) : null;
      headings.forEach((heading) => {
        if (heading.offsetTop <= marker) current = Number(heading.dataset.sectionIndex);
      });
      setActiveReportSection(current);
    };
    updateActiveSection();
    window.addEventListener("scroll", updateActiveSection, { passive: true });
    window.addEventListener("resize", updateActiveSection);
    return () => { window.removeEventListener("scroll", updateActiveSection); window.removeEventListener("resize", updateActiveSection); };
  }, [paid, showFullReport, aiReport]);
  const continueReading = () => {
    if (savedReportPosition <= 0) return;
    setShowContinuePrompt(false);
    window.scrollTo({ top: savedReportPosition, behavior: "smooth" });
  };
  useEffect(() => {
    if (activeReportSection === null || window.innerWidth > 520) return;
    const toc = document.querySelector<HTMLElement>(".report-toc");
    const activeButton = toc?.querySelector<HTMLElement>("button[data-section-index=\"" + activeReportSection + "\"]");
    if (!toc || !activeButton) return;
    const left = activeButton.offsetLeft - (toc.clientWidth - activeButton.offsetWidth) / 2;
    toc.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [activeReportSection]);
  const selectedCategory = categories.find((item) => item.id === category);
  const selectedPlan = plans.find((item) => item.id === plan);
  const pickedColorHexes = pickedColors.map((name) => colors.find((color) => color.name === name)?.hex ?? "#8b5cf6");
  const particleStyle = { "--particle-a": pickedColorHexes[0] ?? "#8b5cf6", "--particle-b": pickedColorHexes[1] ?? "#e8b86a" } as React.CSSProperties;
  const yearOptions = useMemo(() => Array.from({ length: 80 }, (_, i) => String(new Date().getFullYear() - i)), []);
  const update = (key: keyof FormState, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const scrollTop = () => window.scrollTo({ top: 0, behavior: "smooth" });
  const go = (next: number) => { setStep(next); scrollTop(); };
  const start = (event: React.FormEvent) => { event.preventDefault(); const required = [form.nickname, form.year, form.month, form.day, form.place, form.email]; if (!required.every(Boolean)) return toast.error("請先完成必要的誕生資料欄位"); if (!privacyConsent) return toast.error("請先閱讀並同意資料使用說明"); try { resolveBirthMoment(form); } catch (error) { return toast.error(error instanceof Error ? error.message : "請確認出生資料"); } go(2); };
  const toggleColor = (name: string) => setPickedColors((current) => current.includes(name) ? current.filter((item) => item !== name) : current.length < 2 ? [...current, name] : current);
  const finishColors = () => { if (pickedColors.length !== 2) return toast.error("請憑直覺選出 2 個顏色"); go(3); };
  const answer = (index: number) => { setAnswers((current) => ({ ...current, [questionIndex]: index })); if (questionIndex < 9) setQuestionIndex((current) => current + 1); };
  const goPrevQuestion = () => setQuestionIndex((current) => Math.max(0, current - 1));
  const finishStates = () => { if (Object.keys(answers).length !== 10) return toast.error("還有幾個狀態沒有完成探測"); go(4); };
  const selectPlan = (id: string) => { setPlan(id); go(5); };
  const requestAiReport = async () => {
    if (!verifiedSessionId) return;
    setReportError(false);
    try {
      const result = await generateReport.mutateAsync({ sessionId: verifiedSessionId });
      setAiReport(result.report);
      setBirthChart(result.chart);
      setShowFullReport(false);
    } catch {
      setReportError(true);
    }
  };
  const submitPayment = async () => {
    if (!selectedPlan || !selectedCategory || !subQuestion) return;
    setCheckoutRedirecting(true);
    try {
      window.localStorage.setItem("starlovelab-checkout-state", JSON.stringify({ form, pickedColors, answers, category, subQuestion, plan }));
      const result = await createCheckout.mutateAsync({ ...form, time: form.time || "未提供", colors: pickedColors, answers: Object.values(answers), category: selectedCategory.title, subQuestion, plan: selectedPlan.name, planId: selectedPlan.id as "basic" | "plus" | "full", amount: selectedPlan.price });
      if (!result.checkoutUrl) throw new Error("付款頁面建立失敗");
      window.location.assign(result.checkoutUrl);
    } catch (error) {
      setCheckoutRedirecting(false);
      toast.error(error instanceof Error ? error.message : "付款頁面建立失敗，請稍後再試");
    }
  };
  useEffect(() => {
    if (!paymentReturn || !verifiedSessionId || aiReport || generateReport.isPending || verifyPayment.isPending) return;
    setAiReport(""); setShowFullReport(false);
    void requestAiReport();
  }, [paymentReturn, verifiedSessionId]);
  const createReportCanvas = () => {
    if (!aiReport) return null;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const width = 1200;
    const padding = 76;
    const lineHeight = 38;
    const maxWidth = width - padding * 2;
    ctx.font = "24px Noto Sans TC, sans-serif";
    const lines: string[] = [];
    for (const paragraph of aiReport.split("\n\n")) {
      let line = "";
      for (const character of paragraph) {
        const next = line + character;
        if (ctx.measureText(next).width > maxWidth && line) { lines.push(line); line = character; } else line = next;
      }
      if (line) lines.push(line);
      lines.push("");
    }
    const height = Math.max(900, 250 + lines.length * lineHeight);
    canvas.width = width;
    canvas.height = height;
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#171027");
    gradient.addColorStop(1, "#30203e");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#e2b46d";
    ctx.font = "20px DM Mono, monospace";
    ctx.fillText("STARLOVE NOTE · PERSONAL READING", padding, 72);
    ctx.fillStyle = "#f5eadc";
    ctx.font = "600 36px Noto Sans TC, sans-serif";
    ctx.fillText(`給 ${form.nickname} 的一封信`, padding, 130);
    ctx.strokeStyle = "rgba(226,180,109,.35)";
    ctx.beginPath(); ctx.moveTo(padding, 170); ctx.lineTo(width - padding, 170); ctx.stroke();
    ctx.fillStyle = "#d5c6d5";
    ctx.font = "24px Noto Sans TC, sans-serif";
    lines.forEach((line, index) => { if (line) ctx.fillText(line, padding, 225 + index * lineHeight); });
    return canvas;
  };
  const getResultLink = () => {
    const payload = JSON.stringify({ n: form.nickname, q: subQuestion, c: selectedCategory?.title, colors: pickedColors });
    const token = encodeURIComponent(btoa(unescape(encodeURIComponent(payload))));
    return `${window.location.origin}${window.location.pathname}?result=${token}`;
  };
  const downloadReportImage = () => {
    const canvas = createReportCanvas();
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `starlovelab-${form.nickname || "personal-report"}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    toast.success("專屬報告圖片已下載");
  };
  const shareResult = async () => {
    const resultLink = getResultLink();
    const shareText = `我在 StarLoveLab 完成了個人分析，核心求問是：「${subQuestion ?? "我的人生方向"}」\n查看我的專屬結果：${resultLink}`;
    try {
      const canvas = createReportCanvas();
      if (canvas && navigator.share && navigator.canShare) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
        if (blob) {
          const file = new File([blob], `starlovelab-${form.nickname || "personal-report"}.png`, { type: "image/png" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ title: "StarLoveLab 個人分析", text: shareText, url: resultLink, files: [file] });
            return;
          }
        }
      }
      if (navigator.share) { await navigator.share({ title: "StarLoveLab 個人分析", text: shareText, url: resultLink }); }
      else { await navigator.clipboard.writeText(shareText); toast.success("專屬結果連結與分享內容已複製"); }
    } catch { /* 使用者關閉分享視窗時不顯示錯誤 */ }
  };
  const reportSections = aiReport.split("\n\n").map((block, index) => ({ block, index, heading: block.match(/^##\s+(.+)$/)?.[1] })).filter((item): item is { block: string; index: number; heading: string } => Boolean(item.heading));
  const scrollToReportSection = (index: number) => document.getElementById(`report-section-${index}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const renderReport = () => aiReport.split("\n\n").map((block, index) => {
    const heading = block.match(/^##\s+(.+)$/);
    return heading ? <h3 id={`report-section-${index}`} data-section-index={index} className="report-section-title" key={`${index}-${block}`}>{heading[1]}</h3> : <p key={`${index}-${block.slice(0, 12)}`}>{block}</p>;
  });
  const renderReportPreview = () => aiReport.split("\n\n").slice(0, 2).map((block, index) => {
    const heading = block.match(/^##\s+(.+)$/);
    return heading ? <h3 className="report-section-title" key={`${index}-${block}`}>{heading[1]}</h3> : <p key={`${index}-${block.slice(0, 12)}`}>{block}</p>;
  });

  return <div className="app-shell">
    <header className="site-header"><a className="brand" href="#top" onClick={(e) => { e.preventDefault(); go(1); }}><OrbitalMark /><span><b>StarLoveLab</b><small>穹頂靈魂實驗室</small></span></a><div className="header-note"><Sparkles size={14} /> 你的靈魂，正在回應</div></header>
    {checkoutRedirecting && <div className="checkout-loading-overlay" role="status" aria-live="polite" aria-label="正在前往 Stripe 安全付款"><div className="checkout-loading-card"><div className="checkout-loading-orbit"><span /><span /><Sparkles size={24} /></div><p className="eyebrow">SECURE CHECKOUT</p><h2>正在開啟安全付款頁面</h2><p>請稍候，我們正在替你建立專屬付款連線。</p><div className="checkout-loading-bar"><span /></div><small>即將前往 Stripe · 請不要關閉此頁面</small></div></div>}
    <main id="top" className="container">
      {!paid && step > 1 && <Progress step={step} />}
      {paid ? <section className="success-view"><div className="success-orb"><Sparkles size={42} /></div><p className="eyebrow">TRANSMISSION COMPLETE</p><h1>你的靈魂輪廓<br /><em>已經被好好看見。</em></h1><p className="lead">{form.email}，這不是替你算命的答案，而是一份針對「{subQuestion}」寫給你的深入分析。報告產生後會顯示於本頁，可下載保存。</p><div className="receipt-card"><span className="receipt-icon"><Mail size={18} /></span><div><strong>{selectedPlan?.name}</strong><small>收件信箱：{form.email}</small></div><b>NT$ {selectedPlan?.price}</b></div>{birthChart && <div className="birth-chart-card"><div className="report-heading"><span>YOUR BIRTH CHART · VERIFIED</span><b>你的出生星圖</b></div><div className="birth-chart-grid">{Object.entries(birthChart.planets ?? {}).map(([name, point]: [string, any]) => <div key={name}><strong>{name}</strong><span>{point.sign} {Number(point.degree).toFixed(1)}°{point.retrograde ? " ℞" : ""}</span></div>)}</div>{birthChart.ascendant && <div className="chart-ascendant">上升：<b>{birthChart.ascendant.sign} {Number(birthChart.ascendant.degree).toFixed(1)}°</b></div>}<small>{birthChart.note ?? `出生地：${birthChart.birth.place} · 時區：${birthChart.birth.timeZone}`}</small></div>}<div className="report-box"><div className="report-heading"><span>STARLOVE NOTE · PERSONAL READING</span><b>給 {form.nickname} 的一封信</b></div>{generateReport.isPending ? <div className="report-loading" style={particleStyle}><div className="cosmic-loader" aria-label="正在生成專屬報告"><span className="cosmic-star star-a" /><span className="cosmic-star star-b" /><span className="cosmic-star star-c" /><span className="cosmic-orbit orbit-one" /><span className="cosmic-orbit orbit-two" /><span className="cosmic-core"><Sparkles size={19} /></span></div><div className="loading-copy"><b>{reportLoadingMessages[loadingMessageIndex]}</b><small>STARLOVE LAB · 正在為你整理一份只屬於你的文字</small><span className="loading-progress"><i /></span></div></div> : reportError ? <div className="report-error"><p>剛剛的解讀沒有完整抵達，但你的測驗資料已經保留。</p><button className="primary-button" onClick={() => void requestAiReport()}>重新生成專屬分析 <ChevronRight size={17} /></button></div> : showFullReport ? <><nav className="report-toc" aria-label="報告章節導覽"><span className="report-toc-label">快速導覽</span>{reportSections.map((section, index) => <button key={section.heading} data-section-index={section.index} className={activeReportSection === section.index ? "active" : ""} aria-current={activeReportSection === section.index ? "location" : undefined} onClick={() => scrollToReportSection(section.index)}><span>0{index + 1}</span>{section.heading}</button>)}</nav>{showContinuePrompt && savedReportPosition > 0 && reportProgress < 100 && <div className="continue-reading"><div><strong>上次讀到這裡</strong><small>已保存你的閱讀位置，想從上次的位置繼續嗎？</small></div><button onClick={continueReading}>繼續閱讀 <ChevronRight size={15} /></button></div>}<div className="report-progress" aria-label={`報告閱讀進度 ${reportProgress}%`}><div className="report-progress-meta"><span>閱讀進度</span><strong>{reportProgress}%</strong></div><div className="report-progress-track"><span style={{ width: `${reportProgress}%` }} /></div></div><div className="report-body">{renderReport()}</div><div className="report-actions"><button className="report-action-button" onClick={downloadReportImage}>下載專屬報告圖片</button><button className="report-action-button" onClick={() => void shareResult()}>分享結果</button></div></> : <><div className="report-teaser">{renderReportPreview()}</div><button className="primary-button" onClick={() => setShowFullReport(true)}>閱讀完整客製化分析 <ChevronRight size={17} /></button></>}</div><button className="ghost-button" onClick={() => { setPaid(false); go(1); }}>重新探索一次</button></section> : <>
        {step === 1 && <section className="landing-grid"><div className="hero-copy"><div className="eyebrow"><span className="eyebrow-line" /> SOUL FREQUENCY LAB · 2026</div><h1>輸入你的誕生密碼，<br /><em>解開今年無法突破的<br className="mobile-break" />隱形盲點</em></h1><p className="hero-sub">不是預測命運，而是讓你看見，<br />一直在你身邊、卻尚未被命名的答案。</p><div className="signal-row"><span><Star size={15} /> 色彩心理學</span><span><Orbit size={15} /> 10 大狀態探測</span><span><Compass size={15} /> 個人化解讀</span></div></div><form className="form-card" onSubmit={start}><div className="card-kicker">01 <span>/ 基本資料</span></div><h2>先讓我們認識你</h2><p className="card-hint">資料僅用於生成你的專屬報告</p><Field label="暱稱" icon={<Sparkles size={14} />}><input value={form.nickname} onChange={(e) => update("nickname", e.target.value)} placeholder="例如：小星" /></Field><div className="field"><span className="field-label"><CalendarDays size={14} />出生年月日</span><div className="date-row"><select value={form.year} onChange={(e) => update("year", e.target.value)}><option value="">年份</option>{yearOptions.map((year) => <option key={year}>{year}</option>)}</select><select value={form.month} onChange={(e) => update("month", e.target.value)}><option value="">月份</option>{Array.from({ length: 12 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</select><select value={form.day} onChange={(e) => update("day", e.target.value)}><option value="">日期</option>{Array.from({ length: 31 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</select></div></div><Field label="出生時間（可略）" icon={<Clock3 size={14} />}><input type="time" value={form.time} onChange={(e) => update("time", e.target.value)} /></Field><p className="optional-hint">不知道出生時間也沒關係，仍然可以完成個人分析。</p><div className="field"><span className="field-label"><MapPin size={14} />出生地點</span><BirthplaceSelect value={form.place} onChange={(value) => update("place", value)} /></div><Field label="接收報告的 Email" icon={<Mail size={14} />}><input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="you@example.com" /></Field><details className="privacy-details"><summary>資料使用說明</summary><p>你提供的資料僅用於生成與寄送個人分析，測驗紀錄最長保存 90 天，並以匿名 Session 綁定；不會要求建立 Manus 帳號。</p></details><label className="consent-row"><input type="checkbox" checked={privacyConsent} onChange={(e) => setPrivacyConsent(e.target.checked)} /><span>我同意 StarLoveLab 使用上述資料生成個人分析，並依照資料使用說明處理。</span></label><button className="primary-button" type="submit">開始生成我的 StarLoveLab 專屬個人分析 <ChevronRight size={18} /></button><small className="privacy-note">✦ 你的資料將被溫柔地保護 · 保存期限最長 90 天</small></form></section>}
        {step === 2 && <section className="step-section color-step"><div className="step-heading"><div className="eyebrow"><span className="eyebrow-line" /> SIGNAL CALIBRATION · 02</div><h1>哪兩種顏色，<br /><em>讓你的目光停留？</em></h1><p>不要思考。讓第一個浮現的感覺，替你做選擇。</p></div><div className="calculation-note"><span className="pulse-dot" /> 星象運算中... 正在對應你的靈魂磁場... <b>{pickedColors.length} / 2 已選</b></div><div className="color-grid">{colors.map((color, index) => <button key={color.name} disabled={pickedColors.length === 2 && !pickedColors.includes(color.name)} className={`color-card ${pickedColors.includes(color.name) ? "selected" : ""}`} onClick={() => toggleColor(color.name)} style={{ "--swatch": color.hex } as React.CSSProperties}><span className="color-number">0{index + 1}</span><span className="swatch" /><strong>{color.name}</strong><small>{color.note}</small>{pickedColors.includes(color.name) && <span className="selected-mark">✓</span>}</button>)}</div><div className="step-actions"><button className="back-button" onClick={() => go(1)}><ChevronLeft size={17} /> 返回</button><button className="primary-button compact" onClick={finishColors}>鎖定我的色彩密碼 <ChevronRight size={17} /></button></div></section>}
        {step === 3 && <section className="step-section state-step"><div className="step-heading compact-heading"><div className="eyebrow"><span className="eyebrow-line" /> INNER WEATHER SCAN · 03</div><h1>十個問題，<br /><em>捕捉你此刻的內在天氣</em></h1><p>選一個最接近你最近狀態的答案，不用想太久。</p></div><div className="state-card"><div className="question-meta"><span>狀態探測 {String(questionIndex + 1).padStart(2, "0")}</span><span>{questionIndex + 1} / 10</span></div><div className="mini-progress"><span style={{ width: `${((questionIndex + 1) / 10) * 100}%` }} /></div><h2>{states[questionIndex]}</h2><div className="answer-list">{["非常貼近我現在的狀態", "偶爾會有這種感覺", "還不太確定"].map((label, index) => <button key={label} className={answers[questionIndex] === index ? "answer selected" : "answer"} onClick={() => answer(index)}><span className="radio-dot" />{label}<ChevronRight size={17} /></button>)}</div><div className="question-actions"><button className="back-button" onClick={goPrevQuestion} disabled={questionIndex === 0}><ChevronLeft size={16} /> 上一題</button>{questionIndex === 9 ? <button className="primary-button compact" onClick={finishStates}>完成狀態探測 <ChevronRight size={17} /></button> : <span className="auto-next">選擇後自動前往下一題</span>}</div></div></section>}
        {step === 4 && <section className="step-section ask-step"><div className="step-heading"><div className="eyebrow"><span className="eyebrow-line" /> THE CORE QUESTION · 04</div><h1>把你最想知道的事，<br /><em>交給這份分析。</em></h1><p>先選擇一個主題，再從下方選 1 個你最想知道的問題。</p></div><div className="result-summary"><div className="result-summary-head"><span className="eyebrow-line" /><b>先看看你剛剛留下的訊息</b><small>這些不是判決，而是接下來分析的素材</small></div><div className="result-colors"><strong>你的直覺色彩</strong><div>{pickedColors.map((name) => <span key={name}>{name}</span>)}</div></div><div className="result-states"><strong>十大狀態探測回顧</strong>{states.map((state, index) => <div key={state}><span>0{index + 1}</span><p>{state}</p><b>{answerLabels[answers[index]]}</b></div>)}</div></div><div className="category-grid">{categories.map((item) => <button key={item.id} className={`category-card ${category === item.id ? "selected" : ""}`} onClick={() => { setCategory(item.id); setSubQuestion(null); }}><span className="category-icon">{item.icon}</span><span><strong>{item.title}</strong><small>{item.desc}</small></span><ChevronRight size={18} /></button>)}</div>{selectedCategory && <div className="subquestions"><div className="subquestion-title"><span>{selectedCategory.icon}</span><div><b>請再選一個你最想知道的問題</b><small>{selectedCategory.title} · 請從下方選 1 個</small></div></div>{selectedCategory.questions.map((question, index) => <button key={question} className={subQuestion === question ? "subquestion selected" : "subquestion"} onClick={() => setSubQuestion(question)}><span>0{index + 1}</span>{question}<span className="sub-check">{subQuestion === question ? "✓" : ""}</span></button>)}</div>}<div className={`chosen-question ${subQuestion ? "has-selection" : "needs-selection"}`}><span className="chosen-question-icon">{subQuestion ? "✓" : "?"}</span><div><small>已選擇問題</small><strong>{subQuestion ?? "請先從上方選擇一個你最想知道的問題"}</strong>{subQuestion && selectedCategory && <em>{selectedCategory.icon} {selectedCategory.title}</em>}</div></div><div className="step-actions"><button className="back-button" onClick={() => go(3)}><ChevronLeft size={17} /> 返回</button><button className="primary-button compact" disabled={!subQuestion} onClick={() => go(5)}>查看我的專屬方案 <ChevronRight size={17} /></button></div></section>}
        {step === 5 && <section className="step-section pay-step"><div className="step-heading"><div className="eyebrow"><span className="eyebrow-line" /> YOUR SOUL REPORT · 05</div><h1>選擇你想收到的<br /><em>解答深度。</em></h1><p>你的困惑值得一份真正靠近你的解讀。</p></div><div className="chosen-question plan-question-summary"><span className="chosen-question-icon">✓</span><div><small>本次分析將針對</small><strong>{subQuestion}</strong>{selectedCategory && <em>{selectedCategory.icon} {selectedCategory.title}</em>}</div><button className="summary-edit" onClick={() => go(4)}>重新選擇</button></div><div className="plans-grid">{plans.map((item) => <button key={item.id} className={`plan-card ${item.popular ? "featured" : ""} ${plan === item.id ? "selected" : ""}`} onClick={() => selectPlan(item.id)}>{item.popular && <span className="popular-badge">✦ 熱門推薦</span>}<span className="plan-icon">{item.icon}</span><span className="plan-name">{item.name}</span><span className="plan-price"><small>NT$</small>{item.price}</span><span className="plan-copy">{item.copy}</span><span className="plan-items">{item.items.map((entry) => <span key={entry}>✦ {entry}</span>)}</span><span className="plan-cta">選擇這個方案 <ChevronRight size={16} /></span></button>)}</div><div className="secure-note"><WalletCards size={17} /><span><b>Stripe 安全結帳</b><small>付款完成後將返回本頁並開始整理你的個人分析</small></span><span className="secure-chip">安全加密</span></div>{selectedPlan && <div className="checkout-card"><div className="checkout-details"><span className="checkout-label">付款前最後確認</span><span className="checkout-question-label">核心問題</span><strong>{subQuestion}</strong>{selectedCategory && <small className="checkout-category">{selectedCategory.icon} {selectedCategory.title}</small>}<span className="checkout-divider" /><span className="checkout-label">已選擇方案</span><b>{selectedPlan.icon} {selectedPlan.name} · NT$ {selectedPlan.price}</b><small>訂單聯絡信箱：{form.email}</small></div><div className="checkout-actions"><button className="edit-question-button" onClick={() => go(4)}><ChevronLeft size={15} /> 返回修改問題</button><button className="primary-button compact" onClick={submitPayment} disabled={createCheckout.isPending}>{createCheckout.isPending ? "正在前往安全付款..." : "前往 Stripe 安全付款"} <ChevronRight size={17} /></button></div></div>}<div className="step-actions"><button className="back-button" onClick={() => go(4)}><ChevronLeft size={17} /> 返回</button></div></section>}
      </>}
    </main><footer><span>StarLoveLab 穹頂靈魂實驗室</span><span>每一個答案，都從願意看見自己開始。</span></footer>
  </div>;
}
