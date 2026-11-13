"use client";

import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import {
  Megaphone,
  Plus,
  Sparkles,
  Send,
  CheckCircle2,
  Share2,
  MessageCircle,
  Video,
  Facebook,
  ExternalLink,
  RefreshCw,
  Check,
  Copy,
  Globe,
  Smartphone,
  Trash2,
  Edit,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { Badge, statusTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { EmptyState, ErrorBanner } from "@/components/ui/EmptyState";
import { CardListSkeleton } from "@/components/ui/Skeleton";
import { Pagination, usePagination } from "@/components/ui/Pagination";
import { useApiQuery } from "@/hooks/useApi";
import { codynexApi } from "@/lib/codynexOs";
import { campaignSchema } from "@/schemas/forms.schema";
import { toApiError } from "@/lib/axios";
import { formatDateTime } from "@/lib/utils";
import type { BusinessItem, EmailAccountItem } from "@/types/os";

interface CampaignItem {
  id: string;
  businessId: string | null;
  emailAccountId: string | null;
  name: string;
  channel: string;
  occasion?: string | null;
  targetAudience: string | null;
  status: string;
  channels?: string[] | null;
  contentPayload?: Record<string, unknown> | null;
  postResults?: Array<{
    channel: string;
    status: string;
    externalId: string;
    externalUrl: string;
    dispatchedAt: string;
  }> | null;
  createdAt: string;
}

interface OccasionDef {
  key: string;
  name: string;
  nepaliName: string;
  category: string;
  badge: string;
  icon: string;
  defaultPrompt: string;
  culturalKeywords: string[];
  suggestedHashtags: string[];
}

interface SocialAccount {
  id: string;
  businessId: string | null;
  platform: "FACEBOOK" | "TIKTOK" | "WHATSAPP" | "INSTAGRAM";
  accountName: string;
  accountHandle: string | null;
  pageOrPhoneId: string | null;
  isConnected: boolean;
  metadata?: Record<string, unknown> | null;
}

interface GeneratedContent {
  tiktok?: {
    hook: string;
    scenes: Array<{ scene: number; visual: string; audio: string; caption: string }>;
    caption: string;
    audioCue: string;
    hashtags: string[];
  };
  facebook?: {
    headline: string;
    postText: string;
    callToAction: string;
    engagementQuestion: string;
    suggestedVisual: string;
    hashtags: string[];
  };
  whatsapp?: {
    broadcastMessage: string;
    bulletPoints: string[];
    ctaLink: string;
    statusTeaser: string;
  };
  instagram?: {
    caption: string;
    visualDirection: string;
    storySticker: string;
    hashtags: string[];
  };
}

function buildDynamicContent(bizName: string, handle: string): GeneratedContent {
  const brandTag = `#${bizName.replace(/[^a-zA-Z0-9]/g, "")}`;
  const webDomain = `${bizName.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`;
  return {
    tiktok: {
      hook: `✨ चाडपर्वमा के लगाउने सोच्दै हुनुहुन्छ? Watch this ${bizName} glow-up!`,
      scenes: [
        {
          scene: 1,
          visual: "Close-up of lighting traditional brass Diya with glowing marigold backdrop in slow motion.",
          audio: "Trending Nepali acoustic sitar + modern lo-fi chill beat",
          caption: `Warm festive greetings from ${bizName}! 🪔`,
        },
        {
          scene: 2,
          visual: `Smooth transition showing premium festive collections & designer styles from ${bizName}.`,
          audio: "Beat drop with rhythmic Nepali folk fusion",
          caption: `Special Festive Discount with code "FESTIVE20" ✨ Delivery in 24 hrs!`,
        },
        {
          scene: 3,
          visual: "Model laughing with family, celebrating with festive attire and stylish fit.",
          audio: "Warm vocal sign-off",
          caption: `Tap the bio link or message @${handle.replace('@', '')} to shop! 🛍️`,
        },
      ],
      caption: `चाडपर्वको झिलिमिलीसँगै तपाईंको स्टाइल पनि चम्कियोस्! 🪔✨ Celebrate with ${bizName}'s handpicked festive collection. Tap bio link to shop!`,
      audioCue: "Trending Nepali Acoustic Lo-Fi Beat / Tihar Folk Remix",
      hashtags: ["#HappyTihar", "#Tihar2026", "#DeepawaliNepal", brandTag, "#FestiveNepal"],
    },
    facebook: {
      headline: "🪔 चाडपर्व तथा दीपावलीको पावन अवसरमा हार्दिक शुभकामना!",
      postText: `सयपत्रीको सुगन्ध, झिलिमिली बत्तीको उज्यालो, अनि आत्मीय प्रेमको पावन अवसरमा तपाईं र तपाईंको परिवारमा सुख, शान्ति र समृद्धि छाओस्। 🪔✨\n\nयो विशेष उत्सवमा तपाईंको स्टाइललाई अझ विशेष बनाउन ${bizName} ले ल्याएको छ आकर्षक Festive Offers & Collections!\n\n🎁 Exclusive Festive Offer:\n• Use coupon code: "FESTIVE20" for Instant Discount\n• Free & Express Delivery across Nepal within 24 Hours\n• Cash on Delivery & All Digital Payments (eSewa, Khalti, Fonepay) accepted.`,
      callToAction: `Visit www.${webDomain} or message us directly on WhatsApp to place your order today!`,
      engagementQuestion: "यसपालिको उत्सवमा तपाईं कुन रङ्गको पहिरन रोज्दै हुनुहुन्छ? कमेन्टमा बताउनुहोला! 👇",
      suggestedVisual: `High-resolution festive showcase: Golden hour lighting with brass Diyas and ${bizName} highlights.`,
      hashtags: ["#FestiveCollection", brandTag, "#HappyTihar", "#FestiveOffers"],
    },
    whatsapp: {
      broadcastMessage: `*Namaste from ${bizName}!* 🪔✨\n\nWishing you and your family a luminous, prosperous, and joyful festive season!\n\nAs our valued customer, we have reserved an exclusive festive treat for your celebrations:`,
      bulletPoints: [
        "🌟 *Special Festive Discount* with code: *FESTIVE20*",
        "⚡ *Same-Day Delivery* inside Ring Road (Order before 2 PM)",
        "🎁 *Complimentary Festive Gift Box* on qualifying orders",
        "📲 Easy Payment via *eSewa, Khalti, Fonepay, or Cash on Delivery*",
      ],
      ctaLink: `https://${webDomain}/collections/festive`,
      statusTeaser: `🪔 Celebrate with timeless elegance! Special discount with code FESTIVE20 — Shop now!`,
    },
    instagram: {
      caption: `Glow brighter than the diyas this festive season. ✨ Captured in pure elegance and festive warmth. Celebrate with ${bizName}.\n\nCoupon code: FESTIVE20 for discount.\nLink in bio.`,
      visualDirection: `Moody candle-lit flat lay with brass diyas, marigolds, and ${bizName} showcase.`,
      storySticker: "Interactive Slider: 'Rate this festive look 🔥'",
      hashtags: ["#FestiveElegance", brandTag, "#DiwaliVibes"],
    },
  };
}

export default function MarketingPage() {
  const [selectedBizFilter, setSelectedBizFilter] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"studio" | "accounts" | "campaigns">("studio");

  // Queries
  const { data: campaigns, loading: loadingCampaigns, error: campaignError, refetch: refetchCampaigns } =
    useApiQuery<CampaignItem[]>(
      () => codynexApi.marketing.campaigns(selectedBizFilter || undefined),
      [selectedBizFilter]
    );

  const occasionsQuery = useApiQuery<OccasionDef[]>(() => codynexApi.marketing.occasions());
  const socialAccountsQuery = useApiQuery<SocialAccount[]>(
    () => codynexApi.marketing.socialAccounts(selectedBizFilter || undefined),
    [selectedBizFilter]
  );
  const businessesQuery = useApiQuery<BusinessItem[]>(() => codynexApi.businesses.list());
  const emailAccountsQuery = useApiQuery<EmailAccountItem[]>(() => codynexApi.emailAccounts.list());

  const occasions = useMemo(() => occasionsQuery.data ?? [], [occasionsQuery.data]);
  const socialAccounts = useMemo(() => socialAccountsQuery.data ?? [], [socialAccountsQuery.data]);
  const businesses = useMemo(() => businessesQuery.data ?? [], [businessesQuery.data]);
  const emailAccounts = useMemo(() => emailAccountsQuery.data ?? [], [emailAccountsQuery.data]);
  const pagination = usePagination(campaigns ?? [], 8);

  // CEO Content Creator State
  const [selectedOccasion, setSelectedOccasion] = useState<string>("TIHAR");
  const [targetChannels, setTargetChannels] = useState<Array<"TIKTOK" | "FACEBOOK" | "WHATSAPP" | "INSTAGRAM">>([
    "TIKTOK",
    "FACEBOOK",
    "WHATSAPP",
  ]);
  const [brandVoice, setBrandVoice] = useState<"Festive & Warm" | "Royal Luxury" | "High-Energy Hype" | "Casual Friendly">(
    "Festive & Warm"
  );
  const [discountCode, setDiscountCode] = useState<string>("TIHAR2026");
  const [ceoPrompt, setCeoPrompt] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(() =>
    buildDynamicContent("CodyNex Nepal", "@codynexnepal")
  );
  const [previewPlatform, setPreviewPlatform] = useState<"TIKTOK" | "FACEBOOK" | "WHATSAPP">("TIKTOK");
  const [dispatchSuccess, setDispatchSuccess] = useState<{
    dispatches?: Array<{
      channel: string;
      status: string;
      externalId: string;
      externalUrl: string;
      dispatchedAt: string;
    }>;
  } | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [testAccountStatus, setTestAccountStatus] = useState<Record<string, string>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Integrated Social Accounts Modal State
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState<{
    platform: "TIKTOK" | "FACEBOOK" | "WHATSAPP" | "INSTAGRAM";
    accountName: string;
    accountHandle: string;
    pageOrPhoneId: string;
    accessToken: string;
    isConnected: boolean;
  }>({
    platform: "TIKTOK",
    accountName: "CodyNex Nepal Official",
    accountHandle: "@codynexnepal",
    pageOrPhoneId: "tt_codynexnepal",
    accessToken: "",
    isConnected: true,
  });
  const [accountFormErr, setAccountFormErr] = useState<string | null>(null);
  const [isSavingAccount, setIsSavingAccount] = useState(false);

  // Traditional campaign modal state
  const [openLegacyModal, setOpenLegacyModal] = useState(false);
  const [legacySubmitErr, setLegacySubmitErr] = useState<string | null>(null);

  const currentBizName = businesses.find((b) => b.id === selectedBizFilter)?.name || "CodyNex Nepal";
  const tiktokAccount = socialAccounts.find((a) => a.platform === "TIKTOK");
  const facebookAccount = socialAccounts.find((a) => a.platform === "FACEBOOK");
  const whatsappAccount = socialAccounts.find((a) => a.platform === "WHATSAPP");
  const instagramAccount = socialAccounts.find((a) => a.platform === "INSTAGRAM");

  const openCreateAccountModal = (platform?: "TIKTOK" | "FACEBOOK" | "WHATSAPP" | "INSTAGRAM") => {
    setEditingAccountId(null);
    const chosenPlatform = platform || "TIKTOK";
    setAccountForm({
      platform: chosenPlatform,
      accountName: currentBizName,
      accountHandle:
        chosenPlatform === "TIKTOK"
          ? "@codynexnepal"
          : chosenPlatform === "WHATSAPP"
          ? "+977 9743969482"
          : `@${currentBizName.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
      pageOrPhoneId: chosenPlatform === "WHATSAPP" ? "+977 9743969482" : "",
      accessToken: "",
      isConnected: true,
    });
    setAccountFormErr(null);
    setShowAccountModal(true);
  };

  const openEditAccountModal = (acc: SocialAccount) => {
    setEditingAccountId(acc.id);
    setAccountForm({
      platform: acc.platform,
      accountName: acc.accountName,
      accountHandle: acc.accountHandle || "",
      pageOrPhoneId: acc.pageOrPhoneId || "",
      accessToken: "",
      isConnected: acc.isConnected,
    });
    setAccountFormErr(null);
    setShowAccountModal(true);
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingAccount(true);
    setAccountFormErr(null);
    try {
      await codynexApi.marketing.upsertSocialAccount({
        ...(editingAccountId ? { id: editingAccountId } : {}),
        businessId: selectedBizFilter || undefined,
        platform: accountForm.platform,
        accountName: accountForm.accountName.trim(),
        accountHandle: accountForm.accountHandle.trim() || null,
        pageOrPhoneId: accountForm.pageOrPhoneId.trim() || null,
        ...(accountForm.accessToken ? { accessTokenEncrypted: accountForm.accessToken } : {}),
        isConnected: accountForm.isConnected,
        metadata: {
          category: "Official Business Account",
          verified: true,
          updatedAt: new Date().toISOString(),
        },
      });
      await socialAccountsQuery.refetch();
      setShowAccountModal(false);
      setStatusMessage(`Successfully saved ${accountForm.platform} account (${accountForm.accountHandle || accountForm.accountName}).`);
    } catch (err) {
      setAccountFormErr(toApiError(err).message);
    } finally {
      setIsSavingAccount(false);
    }
  };

  const handleDeleteAccount = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to disconnect and delete "${name}"?`)) return;
    try {
      await codynexApi.marketing.deleteSocialAccount(id);
      await socialAccountsQuery.refetch();
      setStatusMessage(`Disconnected account "${name}".`);
    } catch (err) {
      alert(toApiError(err).message);
    }
  };

  // Sync default prompt when occasion changes
  useEffect(() => {
    const occ = occasions.find((o) => o.key === selectedOccasion);
    if (occ) {
      setCeoPrompt(occ.defaultPrompt);
      if (occ.key === "TIHAR") setDiscountCode("TIHAR2026");
      else if (occ.key === "DASHAIN") setDiscountCode("DASHAIN2026");
      else if (occ.key === "BLACK_FRIDAY") setDiscountCode("BF50");
      else setDiscountCode("FESTIVE20");
    }
  }, [selectedOccasion, occasions]);

  // Initial Content generation on load if empty
  useEffect(() => {
    if (!generatedContent && occasions.length > 0) {
      handleGenerateContent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occasions.length]);

  const handleToggleChannel = (ch: "TIKTOK" | "FACEBOOK" | "WHATSAPP" | "INSTAGRAM") => {
    if (targetChannels.includes(ch)) {
      if (targetChannels.length > 1) {
        setTargetChannels(targetChannels.filter((c) => c !== ch));
      }
    } else {
      setTargetChannels([...targetChannels, ch]);
    }
  };

  const handleGenerateContent = async () => {
    setIsGenerating(true);
    setStatusMessage(null);
    setDispatchSuccess(null);
    try {
      const activeBiz = businesses.find((b) => b.id === selectedBizFilter);
      const res = await codynexApi.marketing.generateContent({
        occasionKey: selectedOccasion,
        businessId: selectedBizFilter || undefined,
        businessName: activeBiz?.name || "CodyNex Nepal",
        customPrompt: ceoPrompt,
        channels: targetChannels,
        brandVoice,
        discountCode,
      });
      setGeneratedContent(res.data.content);
      setStatusMessage("AI Content Creator generated multi-channel posts tailored for Nepal & global audience.");
    } catch (err) {
      setStatusMessage(toApiError(err).message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePublishOfficialPosts = async () => {
    if (!generatedContent) return;
    setIsPublishing(true);
    setStatusMessage(null);
    setDispatchSuccess(null);
    try {
      const occ = occasions.find((o) => o.key === selectedOccasion);
      const res = await codynexApi.marketing.publishSocial({
        occasion: occ ? `${occ.name} (${occ.nepaliName})` : "Festive Dispatch",
        channels: targetChannels,
        content: generatedContent as unknown as Record<string, unknown>,
        businessId: selectedBizFilter || undefined,
      });
      setDispatchSuccess(res.data);
      setStatusMessage("🎉 Content successfully published to official accounts with live tracking!");
      refetchCampaigns();
    } catch (err) {
      setStatusMessage(toApiError(err).message);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleTestAccount = async (id: string) => {
    setTestAccountStatus((prev) => ({ ...prev, [id]: "testing..." }));
    try {
      const res = await codynexApi.marketing.testSocialAccount(id);
      setTestAccountStatus((prev) => ({ ...prev, [id]: `${res.data.latencyMs}ms · 100% OK` }));
    } catch {
      setTestAccountStatus((prev) => ({ ...prev, [id]: "failed" }));
    }
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Traditional campaign form
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors: legacyErrors, isSubmitting: isLegacySubmitting },
  } = useForm({
    resolver: yupResolver(campaignSchema),
    defaultValues: {
      name: "",
      channel: "SOCIAL",
      targetAudience: "",
      businessId: "",
      emailAccountId: "",
    },
  });

  const onLegacyCreate = async (values: {
    name: string;
    channel: string;
    targetAudience?: string;
    businessId?: string;
    emailAccountId?: string;
  }) => {
    setLegacySubmitErr(null);
    try {
      await codynexApi.marketing.createCampaign({
        ...values,
        businessId: values.businessId || undefined,
        emailAccountId: values.emailAccountId || undefined,
      });
      reset();
      setOpenLegacyModal(false);
      refetchCampaigns();
    } catch (err) {
      setLegacySubmitErr(toApiError(err).message);
    }
  };

  return (
    <DashboardShell
      title="Digital Marketing & Content Creator"
      subtitle="Executive CEO Studio: create cultural festive content and post directly to official TikTok, Facebook, and WhatsApp accounts."
    >
      <div className="space-y-6">
        {/* Top Control Bar & Stats */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-surface-border pb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("studio")}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all ${
                activeTab === "studio"
                  ? "bg-brand text-ink shadow-sm"
                  : "bg-surface text-ink-muted hover:bg-surface-hover hover:text-ink"
              }`}
            >
              <Sparkles className="h-4 w-4 text-ink" />
              CEO Festive Studio
            </button>
            <button
              onClick={() => setActiveTab("accounts")}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all ${
                activeTab === "accounts"
                  ? "bg-brand text-ink shadow-sm"
                  : "bg-surface text-ink-muted hover:bg-surface-hover hover:text-ink"
              }`}
            >
              <Smartphone className="h-4 w-4 text-ink" />
              Official Accounts ({socialAccounts.length})
            </button>
            <button
              onClick={() => setActiveTab("campaigns")}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all ${
                activeTab === "campaigns"
                  ? "bg-brand text-ink shadow-sm"
                  : "bg-surface text-ink-muted hover:bg-surface-hover hover:text-ink"
              }`}
            >
              <Megaphone className="h-4 w-4 text-ink" />
              Campaigns Feed ({campaigns?.length ?? 0})
            </button>
          </div>

          <div className="flex items-center gap-3">
            <select
              aria-label="Filter by business"
              value={selectedBizFilter}
              onChange={(e) => setSelectedBizFilter(e.target.value)}
              className="h-9 rounded-md border border-surface-border bg-surface px-3 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="">All Businesses ({businesses.length > 0 ? businesses[0].name : "All Brands"})</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>

            <Button variant="outline" onClick={() => setOpenLegacyModal(true)}>
              <Plus className="h-4 w-4" />
              Traditional Campaign
            </Button>
          </div>
        </div>

        {/* Global Notification/Status Banner */}
        {statusMessage && (
          <div
            className={`flex items-center justify-between rounded-lg px-4 py-2.5 text-xs font-medium ${
              statusMessage.includes("🎉") || statusMessage.includes("generated")
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : "bg-amber-50 text-amber-800 border border-amber-200"
            }`}
          >
            <span>{statusMessage}</span>
            <button
              onClick={() => setStatusMessage(null)}
              className="text-[11px] font-semibold underline hover:opacity-80"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* TAB 1: CEO FESTIVE STUDIO & CONTENT CREATOR */}
        {activeTab === "studio" && (
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Left Controls: Occasion & CEO Directives */}
            <div className="space-y-5 lg:col-span-5">
              <Card className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-100 text-amber-700 font-bold text-sm">
                      👑
                    </span>
                    <h2 className="text-sm font-bold text-ink">CEO Executive Directive</h2>
                  </div>
                  <Badge tone="yellow">Festive & Occasions</Badge>
                </div>

                {/* Occasions Picker */}
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
                    Select Cultural Occasion / Festival
                  </label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {occasions.map((occ) => {
                      const isSelected = selectedOccasion === occ.key;
                      return (
                        <button
                          key={occ.key}
                          type="button"
                          onClick={() => setSelectedOccasion(occ.key)}
                          className={`flex flex-col items-start rounded-lg border p-2.5 text-left transition-all ${
                            isSelected
                              ? "border-amber-500 bg-amber-50/50 ring-1 ring-amber-500 shadow-sm"
                              : "border-surface-border bg-surface hover:border-surface-border/80"
                          }`}
                        >
                          <span className="text-base">{occ.icon}</span>
                          <span className="mt-1 text-xs font-bold text-ink line-clamp-1">{occ.name}</span>
                          <span className="text-[10px] text-ink-muted line-clamp-1">{occ.nepaliName}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Target Channels Selection */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted">
                      Publishing to Official Accounts
                    </label>
                    <button
                      type="button"
                      onClick={() => setActiveTab("accounts")}
                      className="text-[11px] font-medium text-brand hover:underline flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" />
                      Manage / Connect Platforms
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleChannel("TIKTOK")}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                        targetChannels.includes("TIKTOK")
                          ? "bg-black text-white shadow-sm"
                          : "border border-surface-border bg-surface text-ink-muted opacity-60"
                      }`}
                    >
                      <Video className="h-3.5 w-3.5" />
                      TikTok ({tiktokAccount?.accountHandle || "@codynexnepal"})
                      {targetChannels.includes("TIKTOK") && <Check className="h-3 w-3" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleChannel("FACEBOOK")}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                        targetChannels.includes("FACEBOOK")
                          ? "bg-blue-600 text-white shadow-sm"
                          : "border border-surface-border bg-surface text-ink-muted opacity-60"
                      }`}
                    >
                      <Facebook className="h-3.5 w-3.5" />
                      Facebook ({facebookAccount?.accountName || "Official Page"})
                      {targetChannels.includes("FACEBOOK") && <Check className="h-3 w-3" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleChannel("WHATSAPP")}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                        targetChannels.includes("WHATSAPP")
                          ? "bg-emerald-600 text-white shadow-sm"
                          : "border border-surface-border bg-surface text-ink-muted opacity-60"
                      }`}
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      WhatsApp ({whatsappAccount?.accountHandle || whatsappAccount?.pageOrPhoneId || "+977 9743969482"})
                      {targetChannels.includes("WHATSAPP") && <Check className="h-3 w-3" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleChannel("INSTAGRAM")}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                        targetChannels.includes("INSTAGRAM")
                          ? "bg-rose-600 text-white shadow-sm"
                          : "border border-surface-border bg-surface text-ink-muted opacity-60"
                      }`}
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      Instagram ({instagramAccount?.accountHandle || `@${currentBizName.toLowerCase().replace(/[^a-z0-9]/g, "")}`})
                      {targetChannels.includes("INSTAGRAM") && <Check className="h-3 w-3" />}
                    </button>
                  </div>
                </div>

                {/* Parameters: Brand Tone & Discount */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink-muted">Brand Voice</label>
                    <select
                      value={brandVoice}
                      onChange={(e) =>
                        setBrandVoice(
                          e.target.value as
                            | "Festive & Warm"
                            | "Royal Luxury"
                            | "High-Energy Hype"
                            | "Casual Friendly"
                        )
                      }
                      className="h-9 w-full rounded-md border border-surface-border bg-surface px-2.5 text-xs text-ink"
                    >
                      <option value="Festive & Warm">Festive & Warm (उत्सवमय)</option>
                      <option value="Royal Luxury">Royal Luxury (शाही ठाँट)</option>
                      <option value="High-Energy Hype">High-Energy Hype (महा-सेल)</option>
                      <option value="Casual Friendly">Casual Friendly (आत्मिय)</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink-muted">Promo / Discount Code</label>
                    <input
                      type="text"
                      value={discountCode}
                      onChange={(e) => setDiscountCode(e.target.value)}
                      placeholder="e.g. TIHAR2026"
                      className="h-9 w-full rounded-md border border-surface-border bg-surface px-2.5 text-xs font-mono font-bold text-ink"
                    />
                  </div>
                </div>

                {/* CEO Prompt Textarea */}
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-xs font-medium text-ink-muted">CEO Instruction & Specific Notes</label>
                    <span className="text-[11px] text-ink-muted">Culturally Grounded in Nepal</span>
                  </div>
                  <textarea
                    rows={3}
                    value={ceoPrompt}
                    onChange={(e) => setCeoPrompt(e.target.value)}
                    placeholder="Provide specific directions or leave default for automatic cultural adaptation..."
                    className="w-full rounded-md border border-surface-border bg-surface p-2.5 text-xs text-ink placeholder:text-ink-muted/50 focus:border-brand focus:outline-none"
                  />
                </div>

                {/* Action Button: Generate */}
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="primary"
                    className="w-full justify-center"
                    loading={isGenerating}
                    onClick={handleGenerateContent}
                  >
                    <Sparkles className="h-4 w-4" />
                    Regenerate AI Content
                  </Button>
                </div>
              </Card>

              {/* Cultural Context Card */}
              {occasions.find((o) => o.key === selectedOccasion) && (
                <Card className="p-4 bg-surface-muted/30">
                  <div className="flex items-center gap-2 mb-2 text-xs font-bold text-ink">
                    <Globe className="h-3.5 w-3.5 text-amber-600" />
                    <span>Cultural Context & Keywords</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {occasions
                      .find((o) => o.key === selectedOccasion)
                      ?.culturalKeywords.map((kw) => (
                        <span
                          key={kw}
                          className="rounded bg-surface px-2 py-0.5 text-[11px] font-medium text-ink border border-surface-border"
                        >
                          {kw}
                        </span>
                      ))}
                  </div>
                </Card>
              )}
            </div>

            {/* Right: Live Interactive Platform Previews & Dispatch */}
            <div className="space-y-4 lg:col-span-7">
              <Card className="p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-border pb-3">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setPreviewPlatform("TIKTOK")}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-all ${
                        previewPlatform === "TIKTOK"
                          ? "bg-black text-white shadow"
                          : "text-ink-muted hover:text-ink hover:bg-surface-hover"
                      }`}
                    >
                      <Video className="h-3.5 w-3.5" />
                      TikTok Preview
                    </button>
                    <button
                      onClick={() => setPreviewPlatform("FACEBOOK")}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-all ${
                        previewPlatform === "FACEBOOK"
                          ? "bg-blue-600 text-white shadow"
                          : "text-ink-muted hover:text-ink hover:bg-surface-hover"
                      }`}
                    >
                      <Facebook className="h-3.5 w-3.5" />
                      Facebook Post
                    </button>
                    <button
                      onClick={() => setPreviewPlatform("WHATSAPP")}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-all ${
                        previewPlatform === "WHATSAPP"
                          ? "bg-emerald-600 text-white shadow"
                          : "text-ink-muted hover:text-ink hover:bg-surface-hover"
                      }`}
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      WhatsApp Broadcast
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      loading={isPublishing}
                      onClick={handlePublishOfficialPosts}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Publish to Official Accounts
                    </Button>
                  </div>
                </div>

                {/* Fast Non-blocking Status Indicator */}
                {isGenerating && (
                  <div className="flex items-center justify-between rounded-lg bg-amber-50/90 border border-amber-200 px-3.5 py-2 text-xs font-medium text-amber-900 shadow-sm">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 animate-spin text-amber-600" />
                      <span>Synthesizing culturally vibrant posts (&lt;2.5s fast pipeline)...</span>
                    </div>
                    <span className="text-[11px] font-mono text-amber-700 font-bold">Turbo AI</span>
                  </div>
                )}

                {/* Previews Content */}
                {!generatedContent ? (
                  <div className="py-16 text-center">
                    <Sparkles className="mx-auto h-8 w-8 animate-spin text-amber-500" />
                    <p className="mt-3 text-xs font-bold text-ink">
                      AI Content Marketer is crafting culturally vibrant posts...
                    </p>
                    <p className="text-[11px] text-ink-muted">Synthesizing hooks, storyboards, and authentic festive copy</p>
                  </div>
                ) : (
                  <div>
                    {/* TIKTOK PREVIEW */}
                    {previewPlatform === "TIKTOK" && generatedContent.tiktok && (
                      <div className="space-y-4">
                        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 text-white shadow-xl">
                          <div className="flex items-center justify-between border-b border-neutral-800 pb-2.5">
                            <div className="flex items-center gap-2">
                              <div className="h-7 w-7 rounded-full bg-gradient-to-tr from-rose-500 to-amber-500 p-0.5">
                                <div className="h-full w-full rounded-full bg-black flex items-center justify-center text-[10px] font-bold">
                                  CN
                                </div>
                              </div>
                              <div>
                                <span className="text-xs font-bold">@codynexnepal</span>
                                <span className="ml-1 text-[10px] text-neutral-400">· Official TikTok</span>
                              </div>
                            </div>
                            <span className="rounded-full bg-neutral-800 px-2.5 py-0.5 text-[10px] font-mono text-amber-300">
                              🎵 {generatedContent.tiktok.audioCue}
                            </span>
                          </div>

                          {/* Hook */}
                          <div className="mt-3 rounded-lg bg-neutral-900/80 p-3 border border-neutral-800">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400">
                              0-3s Video Hook
                            </span>
                            <p className="mt-1 text-sm font-semibold text-neutral-100">
                              {generatedContent.tiktok.hook}
                            </p>
                          </div>

                          {/* Storyboard Scenes */}
                          <div className="mt-3 space-y-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                              Reel / Video Storyboard
                            </span>
                            <div className="grid gap-2 sm:grid-cols-3">
                              {generatedContent.tiktok.scenes.map((sc, i) => (
                                <div
                                  key={i}
                                  className="rounded-md border border-neutral-800 bg-neutral-900 p-2.5 text-[11px]"
                                >
                                  <div className="flex items-center justify-between text-neutral-400 font-mono text-[10px]">
                                    <span>Scene {sc.scene}</span>
                                    <span>0{i * 3 + 2}s</span>
                                  </div>
                                  <p className="mt-1 font-medium text-neutral-200 line-clamp-2">{sc.visual}</p>
                                  <p className="mt-1 text-[10px] text-amber-300 font-mono italic">
                                    Text: &quot;{sc.caption}&quot;
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Caption & Hashtags */}
                          <div className="mt-3 border-t border-neutral-800 pt-3">
                            <p className="text-xs text-neutral-200">{generatedContent.tiktok.caption}</p>
                            <div className="mt-2 flex flex-wrap gap-1">
                              {generatedContent.tiktok.hashtags.map((ht) => (
                                <span key={ht} className="text-[11px] font-bold text-sky-400">
                                  {ht}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              handleCopy(
                                `${generatedContent.tiktok?.caption}\n\n${generatedContent.tiktok?.hashtags.join(" ")}`,
                                "tiktok"
                              )
                            }
                          >
                            {copiedKey === "tiktok" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            {copiedKey === "tiktok" ? "Copied" : "Copy Caption"}
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* FACEBOOK PREVIEW */}
                    {previewPlatform === "FACEBOOK" && generatedContent.facebook && (
                      <div className="space-y-4">
                        <div className="rounded-xl border border-surface-border bg-surface p-4 shadow-sm">
                          <div className="flex items-center justify-between border-b border-surface-border pb-3">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white font-bold text-xs">
                                {(facebookAccount?.accountName || currentBizName).slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <h4 className="text-xs font-bold text-ink">
                                    {facebookAccount?.accountName || currentBizName}
                                  </h4>
                                  <CheckCircle2 className="h-3.5 w-3.5 fill-blue-500 text-white" />
                                </div>
                                <p className="text-[10px] text-ink-muted">Just now · 🌍 Public</p>
                              </div>
                            </div>
                            <Badge tone="blue">Facebook Official Page</Badge>
                          </div>

                          <div className="mt-3 space-y-3">
                            <h3 className="text-sm font-bold text-ink">{generatedContent.facebook.headline}</h3>
                            <p className="whitespace-pre-line text-xs leading-relaxed text-ink">
                              {generatedContent.facebook.postText}
                            </p>

                            <div className="rounded-lg bg-surface-muted/50 p-3 border border-surface-border text-xs">
                              <span className="font-bold text-ink">💬 Question for audience:</span>
                              <p className="mt-0.5 text-ink-muted italic">
                                {generatedContent.facebook.engagementQuestion}
                              </p>
                            </div>

                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {generatedContent.facebook.hashtags.map((ht) => (
                                <span key={ht} className="text-xs font-semibold text-blue-600">
                                  {ht}
                                </span>
                              ))}
                            </div>

                            {/* Suggested Creative */}
                            <div className="rounded-md border border-surface-border bg-gradient-to-r from-amber-50 to-rose-50 p-6 text-center text-xs font-medium text-amber-900">
                              📷 Suggested Creative: {generatedContent.facebook.suggestedVisual}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              handleCopy(
                                `${generatedContent.facebook?.headline}\n\n${generatedContent.facebook?.postText}\n\n${generatedContent.facebook?.hashtags.join(" ")}`,
                                "facebook"
                              )
                            }
                          >
                            {copiedKey === "facebook" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            {copiedKey === "facebook" ? "Copied" : "Copy Post"}
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* WHATSAPP PREVIEW */}
                    {previewPlatform === "WHATSAPP" && generatedContent.whatsapp && (
                      <div className="space-y-4">
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm">
                          <div className="flex items-center justify-between border-b border-emerald-200/60 pb-3">
                            <div className="flex items-center gap-2">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white font-bold text-xs">
                                💬
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <h4 className="text-xs font-bold text-emerald-950">
                                    {whatsappAccount?.accountName || `${currentBizName} Concierge`}
                                  </h4>
                                  <Badge tone="green">Verified Business</Badge>
                                </div>
                                <p className="text-[10px] text-emerald-800">
                                  {whatsappAccount?.accountHandle || whatsappAccount?.pageOrPhoneId || "VIP Customer Broadcast List"}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 rounded-lg bg-white p-3.5 shadow-sm border border-emerald-100 text-xs text-ink space-y-2.5">
                            <p className="whitespace-pre-line leading-relaxed">
                              {generatedContent.whatsapp.broadcastMessage}
                            </p>

                            <div className="rounded-md bg-emerald-50/60 p-2.5 border border-emerald-100 space-y-1">
                              {generatedContent.whatsapp.bulletPoints.map((bp, i) => (
                                <p key={i} className="text-xs font-medium text-emerald-900">
                                  {bp}
                                </p>
                              ))}
                            </div>

                            <a
                              href={generatedContent.whatsapp.ctaLink}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:underline"
                            >
                              🔗 Order / Browse Collection: {generatedContent.whatsapp.ctaLink}
                            </a>
                          </div>

                          <div className="mt-3 rounded bg-emerald-100/60 px-3 py-1.5 text-[11px] text-emerald-900 flex items-center justify-between">
                            <span>Status Teaser: {generatedContent.whatsapp.statusTeaser}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              handleCopy(
                                `${generatedContent.whatsapp?.broadcastMessage}\n\n${generatedContent.whatsapp?.bulletPoints.join("\n")}\n\n${generatedContent.whatsapp?.ctaLink}`,
                                "whatsapp"
                              )
                            }
                          >
                            {copiedKey === "whatsapp" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            {copiedKey === "whatsapp" ? "Copied" : "Copy WhatsApp Msg"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>

              {/* Real-time Dispatch Feedback */}
              {dispatchSuccess && (
                <Card className="p-4 bg-emerald-50/70 border-emerald-200 text-xs text-emerald-950">
                  <div className="flex items-center gap-2 font-bold mb-2 text-emerald-800">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Dispatched to {dispatchSuccess.dispatches?.length} Official Accounts</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {dispatchSuccess.dispatches?.map((d) => (
                      <div
                        key={d.channel}
                        className="rounded bg-white p-2.5 border border-emerald-200 flex flex-col justify-between"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-ink">{d.channel}</span>
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                            {d.status}
                          </span>
                        </div>
                        <a
                          href={d.externalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:underline"
                        >
                          <span>Open Live Post</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: OFFICIAL ACCOUNTS MANAGER */}
        {activeTab === "accounts" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-ink">Integrated Social Media Platforms</h3>
                <p className="text-xs text-ink-muted">
                  Connect and manage your official TikTok, Facebook, WhatsApp, and Instagram accounts for live automated publishing and audience engagement.
                </p>
              </div>
              <Button size="sm" onClick={() => openCreateAccountModal()}>
                <Plus className="h-4 w-4" />
                Integrate New Platform
              </Button>
            </div>

            {socialAccounts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-surface-border bg-surface-muted/30 p-8 text-center space-y-4">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand">
                  <Share2 className="h-6 w-6" />
                </div>
                <div className="max-w-md mx-auto space-y-1">
                  <h4 className="text-sm font-bold text-ink">No Social Platforms Integrated Yet</h4>
                  <p className="text-xs text-ink-muted leading-relaxed">
                    Integrate your own official TikTok, Facebook Page, WhatsApp Business, or Instagram accounts. You can customize handles, phone numbers, and keys for instant CEO automated publishing.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2 pt-2">
                  <Button size="sm" onClick={() => openCreateAccountModal("TIKTOK")}>
                    <Video className="h-3.5 w-3.5" />
                    Connect TikTok
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openCreateAccountModal("FACEBOOK")}>
                    <Facebook className="h-3.5 w-3.5" />
                    Connect Facebook
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openCreateAccountModal("WHATSAPP")}>
                    <MessageCircle className="h-3.5 w-3.5" />
                    Connect WhatsApp
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openCreateAccountModal("INSTAGRAM")}>
                    <Share2 className="h-3.5 w-3.5" />
                    Connect Instagram
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {socialAccounts.map((acc) => (
                  <Card key={acc.id} className="p-5 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-lg text-white font-bold ${
                            acc.platform === "FACEBOOK"
                              ? "bg-blue-600"
                              : acc.platform === "TIKTOK"
                              ? "bg-black"
                              : acc.platform === "WHATSAPP"
                              ? "bg-emerald-600"
                              : "bg-rose-600"
                          }`}
                        >
                          {acc.platform === "FACEBOOK" && <Facebook className="h-5 w-5" />}
                          {acc.platform === "TIKTOK" && <Video className="h-5 w-5" />}
                          {acc.platform === "WHATSAPP" && <MessageCircle className="h-5 w-5" />}
                          {acc.platform === "INSTAGRAM" && <Share2 className="h-5 w-5" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-sm font-bold text-ink">{acc.accountName}</h4>
                            {acc.isConnected && (
                              <CheckCircle2 className="h-4 w-4 fill-emerald-500 text-white" />
                            )}
                          </div>
                          <p className="text-xs text-ink-muted">{acc.accountHandle ?? "Handle not configured"}</p>
                        </div>
                      </div>
                      <Badge tone={acc.isConnected ? "green" : "gray"}>
                        {acc.isConnected ? "CONNECTED" : "OFFLINE"}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs border-t border-surface-border pt-3">
                      <div>
                        <span className="text-[11px] text-ink-muted">Channel ID / Phone:</span>
                        <p className="font-mono text-xs text-ink truncate">{acc.pageOrPhoneId ?? "Default"}</p>
                      </div>
                      <div>
                        <span className="text-[11px] text-ink-muted">Reach / Status:</span>
                        <p className="font-bold text-xs text-ink">{String(acc.metadata?.followers ?? "Active API")}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-surface-border">
                      <span className="text-[11px] text-ink-muted">
                        {testAccountStatus[acc.id] || "Ready for instant dispatch"}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleTestAccount(acc.id)}
                        >
                          <RefreshCw className="h-3 w-3" />
                          Test
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditAccountModal(acc)}
                        >
                          <Edit className="h-3 w-3" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                          onClick={() => handleDeleteAccount(acc.id, acc.accountName)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: CAMPAIGNS & POSTS FEED */}
        {activeTab === "campaigns" && (
          <div className="space-y-4">
            {campaignError && <ErrorBanner message={campaignError} onRetry={refetchCampaigns} />}

            {loadingCampaigns ? (
              <CardListSkeleton count={4} columns={2} />
            ) : !campaigns || campaigns.length === 0 ? (
              <EmptyState
                icon={Megaphone}
                title="No campaigns published yet"
                description="Go to CEO Festive Studio to create your first multi-channel post."
              />
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  {pagination.pageItems.map((c) => (
                    <Card key={c.id} className="p-5 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-ink">{c.name}</h3>
                          {c.occasion && <Badge tone="yellow">{c.occasion}</Badge>}
                        </div>
                        <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                        <span>Channel: {c.channel}</span>
                        {c.channels && c.channels.length > 0 && (
                          <div className="flex gap-1">
                            {c.channels.map((ch) => (
                              <Badge key={ch} tone="blue">
                                {ch}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      {c.targetAudience && (
                        <p className="text-xs text-ink-muted">{c.targetAudience}</p>
                      )}

                      {/* Dispatched Post Links */}
                      {c.postResults && c.postResults.length > 0 && (
                        <div className="rounded-md bg-surface-muted/60 p-2.5 text-xs space-y-1.5 border border-surface-border">
                          <span className="text-[11px] font-bold text-ink-muted">Official Dispatches:</span>
                          <div className="flex flex-wrap gap-2">
                            {c.postResults.map((pr) => (
                              <a
                                key={pr.channel}
                                href={pr.externalUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1 rounded bg-surface px-2 py-0.5 text-[11px] font-semibold text-brand hover:underline border border-surface-border"
                              >
                                <span>{pr.channel} Post</span>
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      <p className="text-[11px] tabular-nums text-ink-muted border-t border-surface-border pt-2">
                        Created {formatDateTime(c.createdAt)}
                      </p>
                    </Card>
                  ))}
                </div>
                <Pagination
                  page={pagination.page}
                  pageSize={pagination.pageSize}
                  totalItems={pagination.totalItems}
                  onPageChange={pagination.setPage}
                  onPageSizeChange={pagination.setPageSize}
                />
              </>
            )}
          </div>
        )}
      </div>

      {/* Legacy Campaign Modal */}
      <Modal open={openLegacyModal} onClose={() => setOpenLegacyModal(false)} title="Create Traditional Campaign">
        <form onSubmit={handleSubmit(onLegacyCreate)} className="space-y-4">
          {legacySubmitErr && <ErrorBanner message={legacySubmitErr} />}
          <Input label="Campaign Name" error={legacyErrors.name?.message} {...register("name")} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink">Business</label>
              <select
                {...register("businessId")}
                className="h-10 w-full rounded-md border border-surface-border bg-surface px-3 text-sm text-ink"
              >
                <option value="">Default / Any Business</option>
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink">Channel</label>
              <select
                {...register("channel")}
                className="h-10 w-full rounded-md border border-surface-border bg-surface px-3 text-sm text-ink"
              >
                <option value="SOCIAL">SOCIAL</option>
                <option value="EMAIL">EMAIL</option>
                <option value="SEO">SEO</option>
                <option value="CONTENT">CONTENT</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-ink">Sender Account</label>
            <select
              {...register("emailAccountId")}
              className="h-10 w-full rounded-md border border-surface-border bg-surface px-3 text-sm text-ink"
            >
              <option value="">Auto-select Business Default</option>
              {emailAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.label} ({acc.fromEmail})
                </option>
              ))}
            </select>
          </div>
          <Textarea label="Target Audience" rows={3} {...register("targetAudience")} />
          <Button type="submit" variant="dark" loading={isLegacySubmitting}>
            Submit Campaign
          </Button>
        </form>
      </Modal>

      {/* Integrate / Edit Social Account Modal */}
      <Modal
        open={showAccountModal}
        onClose={() => setShowAccountModal(false)}
        title={editingAccountId ? "Edit Social Media Platform" : "Integrate Your Social Media Platform"}
      >
        <form onSubmit={handleSaveAccount} className="space-y-4">
          {accountFormErr && (
            <div className="rounded-md bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
              {accountFormErr}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Select Platform *</label>
            <select
              value={accountForm.platform}
              onChange={(e) =>
                setAccountForm({
                  ...accountForm,
                  platform: e.target.value as "TIKTOK" | "FACEBOOK" | "WHATSAPP" | "INSTAGRAM",
                })
              }
              className="w-full h-9 rounded-md border border-surface-border bg-surface px-3 text-xs text-ink focus:ring-1 focus:ring-brand"
            >
              <option value="TIKTOK">TikTok</option>
              <option value="FACEBOOK">Facebook Page</option>
              <option value="WHATSAPP">WhatsApp Business</option>
              <option value="INSTAGRAM">Instagram</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">
              Account / Business Name *
            </label>
            <Input
              required
              placeholder="e.g. CodyNex Nepal Official"
              value={accountForm.accountName}
              onChange={(e) => setAccountForm({ ...accountForm, accountName: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">
                Account Handle / Username
              </label>
              <Input
                placeholder={accountForm.platform === "TIKTOK" ? "@codynexnepal" : "@username"}
                value={accountForm.accountHandle}
                onChange={(e) => setAccountForm({ ...accountForm, accountHandle: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">
                {accountForm.platform === "WHATSAPP" ? "Phone Number (+977...)" : "Page / Channel ID"}
              </label>
              <Input
                placeholder={accountForm.platform === "WHATSAPP" ? "+977 9743969482" : "page_id_123"}
                value={accountForm.pageOrPhoneId}
                onChange={(e) => setAccountForm({ ...accountForm, pageOrPhoneId: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">
              API Key / Access Token / Webhook Secret (Optional)
            </label>
            <Input
              type="password"
              placeholder="Enter developer access token or leave blank"
              value={accountForm.accessToken}
              onChange={(e) => setAccountForm({ ...accountForm, accessToken: e.target.value })}
            />
            <p className="mt-1 text-[11px] text-ink-muted">
              Securely stored in your PostgreSQL database. Enables live API dispatches to your official accounts.
            </p>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="isConnectedCheck"
              checked={accountForm.isConnected}
              onChange={(e) => setAccountForm({ ...accountForm, isConnected: e.target.checked })}
              className="h-4 w-4 rounded border-surface-border text-brand focus:ring-brand"
            />
            <label htmlFor="isConnectedCheck" className="text-xs font-medium text-ink cursor-pointer">
              Active Connection (Enable instant automated CEO dispatch)
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-surface-border">
            <Button type="button" variant="outline" onClick={() => setShowAccountModal(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSavingAccount}>
              {isSavingAccount ? "Saving..." : editingAccountId ? "Update Account" : "Integrate Account"}
            </Button>
          </div>
        </form>
      </Modal>
    </DashboardShell>
  );
}
