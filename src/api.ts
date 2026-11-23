const API_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "");
const TOKEN_KEY = "fairbloom.admin.token";

export type Role = "admin" | "farmer" | "buyer";
export type VerificationStatus = "pending" | "approved" | "rejected";
export type TransactionStatus = "pending" | "approved" | "rejected";

export interface AdminUser {
  _id: string;
  id?: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  farmLocation?: string | null;
  buyerCategory?: string | null;
  businessLocation?: string | null;
  verificationStatus: VerificationStatus;
  verificationNote?: string | null;
  verificationDocument?: string | null;
  isEmailVerified: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface Pagination {
  total: number;
  page: number;
  pages: number;
}

export interface Transaction {
  _id: string;
  /** null once the submitting account was erased (transactions anonymized). */
  submittedBy?: { _id: string; name: string; role: Role; email?: string } | string | null;
  /** "deal" = accepted by both parties in chat; "manual" = an older one-sided report. */
  source?: "deal" | "manual";
  farmer?: { _id: string; name: string } | string | null;
  buyer?: { _id: string; name: string } | string | null;
  flowerVariety: string;
  price: number;
  volume: number;
  location?: string;
  flaggedForReview: boolean;
  /** How far the price was from the 30-day index when it was recorded. */
  deviationPercent: number | null;
  status: TransactionStatus;
  createdAt: string;
}

export interface VerificationUser extends AdminUser {
  documentUrl: string | null;
}

export type ListingReviewStatus = "pending" | "approved" | "rejected";

/** A marketplace post in the admin review queue. */
export interface ReviewListing {
  _id: string;
  postedBy: {
    _id: string;
    name: string;
    email?: string;
    role: Role;
    farmLocation?: string | null;
    businessLocation?: string | null;
    buyerCategory?: string | null;
  } | null;
  type: "sell" | "request";
  flowerVariety: string;
  quantity: number;
  pricePerUnit: number | null;
  location: string;
  description?: string;
  imageUrl: string | null;
  status: "active" | "fulfilled" | "cancelled";
  /** "pending" = flagged by the price check and hidden until reviewed. */
  reviewStatus?: ListingReviewStatus;
  /** Signed % from the market VWAP when last checked (positive = above). */
  priceDeviationPercent?: number | null;
  marketVwapAtCheck?: number | null;
  reviewNote?: string | null;
  reviewedBy?: { _id: string; name: string } | null;
  reviewedAt?: string | null;
  createdAt: string;
}

export interface UserActivity {
  activeListings: number;
  transactions: Record<string, number>;
}

export interface AdminNotification {
  _id: string;
  /** e.g. "verification_pending", "transaction_flagged" */
  type: string;
  title: string;
  body: string;
  transaction?: string;
  subject?: string;
  listing?: string;
  count?: number;
  isRead: boolean;
  updatedAt: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const authToken = {
  get: () => window.localStorage.getItem(TOKEN_KEY),
  set: (token: string) => window.localStorage.setItem(TOKEN_KEY, token),
  clear: () => window.localStorage.removeItem(TOKEN_KEY),
};

function expireSession() {
  authToken.clear();
  window.dispatchEvent(new Event("fairbloom:unauthorized"));
}

function queryString(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const value = search.toString();
  return value ? `?${value}` : "";
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string | null } = {}
): Promise<T> {
  const token = options.token === undefined ? authToken.get() : options.token;
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(
      "Can't connect to the FairBloom server. Check the API URL and your connection.",
      0
    );
  }

  const isJson = (response.headers.get("content-type") ?? "").includes("application/json");
  if (response.ok && !isJson && response.status !== 204) {
    // Usually means VITE_API_URL points at the admin site itself, which answers with index.html.
    throw new ApiError(
      "The server sent an unexpected response. Check that VITE_API_URL points to the FairBloom API.",
      response.status
    );
  }

  const payload: unknown = isJson ? await response.json().catch(() => null) : null;
  if (!response.ok) {
    if (response.status === 401 && token) expireSession();
    throw new ApiError(
      errorMessage(payload, `Request failed (${response.status})`),
      response.status
    );
  }
  return payload as T;
}

/** The backend sends `{ message }`, or `{ errors: [{ msg }] }` when request validation fails. */
function errorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const body = payload as { message?: unknown; errors?: { msg?: unknown }[] };
  if (typeof body.message === "string") return body.message;
  const first = Array.isArray(body.errors)
    ? body.errors.find((e) => typeof e?.msg === "string")
    : undefined;
  return typeof first?.msg === "string" ? first.msg : fallback;
}

export const adminApi = {
  login: (email: string, password: string) =>
    request<{ token: string; user: Pick<AdminUser, "name" | "email" | "role"> & { id?: string } }>(
      "/auth/login",
      {
        method: "POST",
        body: { email, password },
        token: null,
      }
    ),

  me: () => request<{ user: AdminUser }>("/auth/me"),

  dashboard: async () => {
    const [transactions, verifications, listings, users] = await Promise.all([
      request<{ transactions: Transaction[] }>("/transactions/pending"),
      request<{ users: VerificationUser[]; pagination: Pagination }>(
        "/admin/verifications?status=pending&limit=1"
      ),
      request<{ listings: ReviewListing[]; pagination: Pagination }>(
        "/admin/listings?reviewStatus=pending&limit=1"
      ),
      request<{ users: AdminUser[]; pagination: Pagination }>("/admin/users?limit=1"),
    ]);
    return {
      pendingTransactions: transactions.transactions,
      pendingVerifications: verifications.pagination.total,
      pendingListings: listings.pagination.total,
      totalUsers: users.pagination.total,
    };
  },

  pendingTransactions: () => request<{ transactions: Transaction[] }>("/transactions/pending"),

  transactions: (page: number, flowerVariety: string) =>
    request<{ transactions: Transaction[]; pagination: Pagination }>(
      `/transactions${queryString({ page, limit: 30, flowerVariety: flowerVariety || undefined })}`
    ),

  reviewTransaction: (id: string, decision: "approve" | "reject") =>
    request<{ transaction: Transaction }>(`/transactions/${id}/review`, {
      method: "PATCH",
      body: { decision },
    }),

  verifications: (status: VerificationStatus, page: number) =>
    request<{ users: VerificationUser[]; pagination: Pagination }>(
      `/admin/verifications${queryString({ status, page, limit: 20 })}`
    ),

  reviewVerification: (id: string, decision: "approve" | "reject", reason?: string) =>
    request<{ user: AdminUser; documentDeleted: boolean }>(`/admin/users/${id}/verification`, {
      method: "PATCH",
      body: { decision, reason },
    }),

  listingReviews: (reviewStatus: ListingReviewStatus, page: number) =>
    request<{ listings: ReviewListing[]; pagination: Pagination }>(
      `/admin/listings${queryString({ reviewStatus, page, limit: 20 })}`
    ),

  reviewListing: (id: string, decision: "approve" | "reject", reason?: string) =>
    request<{ listing: ReviewListing }>(`/admin/listings/${id}/review`, {
      method: "PATCH",
      body: { decision, reason },
    }),

  /** Listing photos are served publicly by the API host. */
  listingImageSrc: (imageUrl: string) => `${API_URL.replace(/\/api$/, "")}${imageUrl}`,

  users: (filters: {
    search: string;
    role: string;
    status: string;
    verified: string;
    page: number;
  }) =>
    request<{ users: AdminUser[]; pagination: Pagination }>(
      `/admin/users${queryString({
        ...filters,
        search: filters.search || undefined,
        role: filters.role || undefined,
        status: filters.status || undefined,
        verified: filters.verified || undefined,
        limit: 20,
      })}`
    ),

  user: (id: string) => request<{ user: AdminUser; activity: UserActivity }>(`/admin/users/${id}`),

  /** Deactivating also cancels the member's active listings and open deals (reported in `cleanup`). */
  setUserStatus: (id: string, isActive: boolean) =>
    request<{
      user: AdminUser;
      message: string;
      cleanup?: { listingsCancelled: number; openDealsCancelled: number };
    }>(`/admin/users/${id}/status`, {
      method: "PATCH",
      body: { isActive },
    }),

  notifications: () =>
    request<{ notifications: AdminNotification[]; unreadCount: number; pagination: Pagination }>(
      "/notifications?limit=20"
    ),

  unreadNotifications: () => request<{ unreadCount: number }>("/notifications/unread-count"),

  markNotificationRead: (id: string) =>
    request<{ notification: AdminNotification }>(`/notifications/${id}/read`, { method: "PATCH" }),

  markAllNotificationsRead: () =>
    request<{ updated: number }>("/notifications/read-all", { method: "PATCH" }),

  eraseUser: (id: string, confirmEmail: string, transactions: "anonymize" | "delete") =>
    request<{ message: string }>(`/admin/users/${id}/erase`, {
      method: "POST",
      body: { confirmEmail, transactions },
    }),

  verificationImage: async (documentUrl: string) => {
    const token = authToken.get();
    let response: Response;
    try {
      response = await fetch(`${API_URL.replace(/\/api$/, "")}${documentUrl}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {
      throw new ApiError("Could not load the verification document.", 0);
    }
    if (!response.ok) {
      if (response.status === 401 && token) expireSession();
      throw new ApiError("Could not load the verification document.", response.status);
    }
    return URL.createObjectURL(await response.blob());
  },

  backup: async () => {
    const token = authToken.get();
    let response: Response;
    try {
      response = await fetch(`${API_URL}/admin/backup`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {
      throw new ApiError("Can't connect to the FairBloom server.", 0);
    }
    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => null);
      if (response.status === 401 && token) expireSession();
      throw new ApiError(
        errorMessage(payload, `Backup failed (${response.status})`),
        response.status
      );
    }

    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") ?? "";
    const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? "fairbloom-backup.json";
    return { blob, filename };
  },
};

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value)
  );
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2 }).format(value);
}

const nameOf = (party: Transaction["farmer"]) =>
  party && typeof party === "object" ? party.name : null;

export function submitterName(transaction: Transaction) {
  if (transaction.submittedBy && typeof transaction.submittedBy === "object")
    return transaction.submittedBy.name;
  return nameOf(transaction.farmer) ?? nameOf(transaction.buyer) ?? "Unknown member";
}

/** "Farmer → Buyer" for deal-based sales; null when either side was erased. */
export function dealParties(transaction: Transaction) {
  const farmer = nameOf(transaction.farmer);
  const buyer = nameOf(transaction.buyer);
  return farmer && buyer ? `${farmer} → ${buyer}` : null;
}
