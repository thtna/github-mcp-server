/**
 * ═══════════════════════════════════════════════════════════
 *  HỆ THỐNG MIỄN DỊCH (Immune System) cho GitHub MCP
 * ═══════════════════════════════════════════════════════════
 * 
 * Kiến trúc phòng thủ 3 lớp:
 *  Lớp 1 (Primary):   Gọi GitHub API bình thường qua Octokit.
 *  Lớp 2 (Retry):     Chờ 1 giây rồi thử lại (xử lý Rate Limit / Network).
 *  Lớp 3 (Quarantine): Cô lập lỗi, ghi nhật ký, trả thông báo an toàn.
 * 
 *  Đặc biệt: Tự phát hiện Token hết hạn, Rate Limit, Network timeout.
 */

// ─── Nhật ký Miễn dịch (Immune Journal) ─────────────────────
interface ImmuneLogEntry {
  timestamp: string;
  toolName: string;
  layer: "PRIMARY" | "RETRY" | "QUARANTINE";
  errorMessage: string;
  diagnosis: string;
}

const immuneJournal: ImmuneLogEntry[] = [];
const MAX_JOURNAL = 100;

function logImmune(toolName: string, layer: ImmuneLogEntry["layer"], errorMessage: string, diagnosis: string) {
  const entry: ImmuneLogEntry = {
    timestamp: new Date().toISOString(),
    toolName,
    layer,
    errorMessage,
    diagnosis,
  };
  console.error(`[GitHub Miễn dịch][${layer}] ${toolName}: ${diagnosis} — ${errorMessage}`);
  immuneJournal.push(entry);
  if (immuneJournal.length > MAX_JOURNAL) immuneJournal.shift();
}

export function getImmuneJournal(): ImmuneLogEntry[] {
  return [...immuneJournal];
}

// ─── Chẩn đoán bệnh (Error Diagnosis) ──────────────────────
function diagnoseError(err: any): string {
  const msg = err?.message?.toLowerCase() || "";
  const status = err?.status;

  if (status === 401 || msg.includes("bad credentials"))
    return "TOKEN HẾT HẠN HOẶC SAI — Cần tạo Token mới trên GitHub.";
  if (status === 403 && msg.includes("rate limit"))
    return "RATE LIMIT — GitHub giới hạn số lần gọi API. Chờ vài phút rồi thử lại.";
  if (status === 403)
    return "QUYỀN TRUY CẬP BỊ TỪ CHỐI — Token không có đủ scope cho hành động này.";
  if (status === 404)
    return "KHÔNG TÌM THẤY — Repository, file, hoặc tài nguyên không tồn tại.";
  if (status === 422)
    return "DỮ LIỆU KHÔNG HỢP LỆ — Tham số gửi lên GitHub bị sai định dạng.";
  if (msg.includes("econnrefused") || msg.includes("enotfound") || msg.includes("timeout"))
    return "MẤT KẾT NỐI MẠNG — Không thể kết nối tới GitHub. Kiểm tra Internet.";
  if (msg.includes("socket hang up") || msg.includes("econnreset"))
    return "KẾT NỐI BỊ NGẮT ĐỘT NGỘT — Mạng không ổn định. Tự động thử lại.";

  return `LỖI KHÔNG XÁC ĐỊNH (HTTP ${status || "N/A"})`;
}

// ─── Lõi Miễn dịch (Resilient Executor) ─────────────────────
export async function resilientGitHub<T>(
  toolName: string,
  primaryFn: () => Promise<T>
): Promise<{ status: "healthy" | "healed" | "quarantined"; method: string; diagnosis?: string; data: T }> {

  // ═══ LỚP 1: Thực thi chính ═══
  try {
    const data = await primaryFn();
    return { status: "healthy", method: "github_api", data };
  } catch (err1: any) {
    const diag1 = diagnoseError(err1);
    logImmune(toolName, "PRIMARY", err1.message, diag1);

    // Nếu lỗi 401/403/404/422 thì KHÔNG retry (retry cũng vô ích)
    const noRetryStatuses = [401, 403, 404, 422];
    if (noRetryStatuses.includes(err1.status)) {
      logImmune(toolName, "QUARANTINE", err1.message, `Lỗi xác định (${err1.status}). Cô lập ngay, không cần retry.`);
      return {
        status: "quarantined",
        method: "quarantine_known_error",
        diagnosis: diag1,
        data: { error: diag1, http_status: err1.status } as any,
      };
    }
  }

  // ═══ LỚP 2: Retry sau 1.5 giây (dành cho lỗi mạng / timeout) ═══
  try {
    await sleep(1500);
    const data = await primaryFn();
    logImmune(toolName, "RETRY", "Đã phục hồi!", "Lần 2 thành công sau khi chờ mạng ổn định.");
    return { status: "healed", method: "github_api_retry", data };
  } catch (err2: any) {
    const diag2 = diagnoseError(err2);
    logImmune(toolName, "QUARANTINE", err2.message, `Retry thất bại. Cô lập: ${diag2}`);
  }

  // ═══ LỚP 3: Cô lập tuyệt đối ═══
  return {
    status: "quarantined",
    method: "quarantine_full",
    diagnosis: "Tất cả các lớp phòng thủ đã kích hoạt. Không thể kết nối GitHub.",
    data: { error: "Không thể hoàn thành yêu cầu sau 2 lần thử. Kiểm tra mạng và Token." } as any,
  };
}

// ─── Tiện ích ────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
