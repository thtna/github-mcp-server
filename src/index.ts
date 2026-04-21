import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Octokit } from "@octokit/rest";
import { resilientGitHub, getImmuneJournal } from "./immune-system.js";

const TOKEN = process.env.GITHUB_PERSONAL_ACCESS_TOKEN || "";
const octokit = new Octokit({ auth: TOKEN });

const server = new Server(
  { name: "github-mcp-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// ══════════════════════════════════════════════════════════════
//  ĐĂNG KÝ TOÀN BỘ CÔNG CỤ (không giới hạn)
// ══════════════════════════════════════════════════════════════
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "gh_list_repos",
      description: "Liệt kê tất cả repository của bạn trên GitHub.",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", description: "Loại repo: all, owner, public, private, member. Mặc định: owner" }
        }
      },
    },
    {
      name: "gh_get_repo",
      description: "Lấy thông tin chi tiết một repository.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Chủ sở hữu repo" },
          repo: { type: "string", description: "Tên repository" },
        },
        required: ["owner", "repo"],
      },
    },
    {
      name: "gh_list_issues",
      description: "Liệt kê các Issues trong một repository.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          state: { type: "string", description: "open, closed, hoặc all. Mặc định: open" }
        },
        required: ["owner", "repo"],
      },
    },
    {
      name: "gh_create_issue",
      description: "Tạo một Issue mới trong repository.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          title: { type: "string", description: "Tiêu đề Issue" },
          body: { type: "string", description: "Nội dung Issue" },
        },
        required: ["owner", "repo", "title"],
      },
    },
    {
      name: "gh_get_file",
      description: "Đọc nội dung một file từ repository trên GitHub.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          path: { type: "string", description: "Đường dẫn file, ví dụ: src/index.ts" },
          ref: { type: "string", description: "Branch hoặc commit SHA. Mặc định: main" },
        },
        required: ["owner", "repo", "path"],
      },
    },
    {
      name: "gh_list_branches",
      description: "Liệt kê tất cả branches trong repository.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
        },
        required: ["owner", "repo"],
      },
    },
    {
      name: "gh_list_pulls",
      description: "Liệt kê Pull Requests trong repository.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          state: { type: "string", description: "open, closed, hoặc all. Mặc định: open" }
        },
        required: ["owner", "repo"],
      },
    },
    {
      name: "gh_search_code",
      description: "Tìm kiếm code trên toàn bộ GitHub.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Từ khóa tìm kiếm" },
        },
        required: ["query"],
      },
    },
    {
      name: "gh_search_repos",
      description: "Tìm kiếm repository trên GitHub.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Từ khóa tìm kiếm" },
        },
        required: ["query"],
      },
    },
    {
      name: "gh_get_user",
      description: "Lấy thông tin profile người dùng GitHub hiện tại.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "gh_create_repo",
      description: "Tạo repository mới trên GitHub.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Tên repository" },
          description: { type: "string", description: "Mô tả" },
          private: { type: "boolean", description: "Riêng tư? Mặc định: false" },
        },
        required: ["name"],
      },
    },
    {
      name: "gh_immune_status",
      description: "Xem nhật ký Hệ thống Miễn dịch GitHub — tất cả các lỗi đã tự chữa lành.",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

// ══════════════════════════════════════════════════════════════
//  XỬ LÝ GỌI CÔNG CỤ (Mọi tool đều xuyên qua Miễn Dịch)
// ══════════════════════════════════════════════════════════════
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = request.params.arguments || {};

  try {
    switch (request.params.name) {

      case "gh_list_repos": {
        const result = await resilientGitHub("gh_list_repos", async () => {
          const { data } = await octokit.repos.listForAuthenticatedUser({
            type: (args.type as any) || "owner", per_page: 30, sort: "updated"
          });
          return data.map(r => ({
            ten: r.full_name, mo_ta: r.description, ngon_ngu: r.language,
            sao: r.stargazers_count, rieng_tu: r.private, url: r.html_url,
          }));
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "gh_get_repo": {
        const result = await resilientGitHub("gh_get_repo", async () => {
          const { data } = await octokit.repos.get({ owner: args.owner as string, repo: args.repo as string });
          return {
            ten: data.full_name, mo_ta: data.description, ngon_ngu: data.language,
            sao: data.stargazers_count, fork: data.forks_count,
            tao_ngay: data.created_at, cap_nhat: data.updated_at, url: data.html_url,
          };
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "gh_list_issues": {
        const result = await resilientGitHub("gh_list_issues", async () => {
          const { data } = await octokit.issues.listForRepo({
            owner: args.owner as string, repo: args.repo as string,
            state: (args.state as any) || "open", per_page: 30,
          });
          return data.map(i => ({
            so: i.number, tieu_de: i.title, trang_thai: i.state,
            nguoi_tao: i.user?.login, ngay_tao: i.created_at, url: i.html_url,
          }));
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "gh_create_issue": {
        const result = await resilientGitHub("gh_create_issue", async () => {
          const { data } = await octokit.issues.create({
            owner: args.owner as string, repo: args.repo as string,
            title: args.title as string, body: (args.body as string) || "",
          });
          return { so: data.number, tieu_de: data.title, url: data.html_url };
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "gh_get_file": {
        const result = await resilientGitHub("gh_get_file", async () => {
          const { data } = await octokit.repos.getContent({
            owner: args.owner as string, repo: args.repo as string,
            path: args.path as string, ref: (args.ref as string) || undefined,
          });
          if (Array.isArray(data)) return { loai: "thu_muc", so_file: data.length, danh_sach: data.map(f => f.name) };
          if ("content" in data && data.encoding === "base64") {
            return { loai: "file", ten: data.name, kich_thuoc: data.size, noi_dung: Buffer.from(data.content, "base64").toString("utf-8") };
          }
          return { loai: "file", ten: (data as any).name };
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "gh_list_branches": {
        const result = await resilientGitHub("gh_list_branches", async () => {
          const { data } = await octokit.repos.listBranches({
            owner: args.owner as string, repo: args.repo as string, per_page: 30,
          });
          return data.map(b => ({ ten: b.name, bao_ve: b.protected }));
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "gh_list_pulls": {
        const result = await resilientGitHub("gh_list_pulls", async () => {
          const { data } = await octokit.pulls.list({
            owner: args.owner as string, repo: args.repo as string,
            state: (args.state as any) || "open", per_page: 30,
          });
          return data.map(p => ({
            so: p.number, tieu_de: p.title, trang_thai: p.state,
            nguoi_tao: p.user?.login, nhanh_goc: p.head.ref, nhanh_dich: p.base.ref, url: p.html_url,
          }));
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "gh_search_code": {
        const result = await resilientGitHub("gh_search_code", async () => {
          const { data } = await octokit.search.code({ q: args.query as string, per_page: 15 });
          return {
            tong_ket_qua: data.total_count,
            danh_sach: data.items.map(i => ({
              ten_file: i.name, duong_dan: i.path, repo: i.repository.full_name, url: i.html_url,
            })),
          };
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "gh_search_repos": {
        const result = await resilientGitHub("gh_search_repos", async () => {
          const { data } = await octokit.search.repos({ q: args.query as string, per_page: 15, sort: "stars" });
          return {
            tong_ket_qua: data.total_count,
            danh_sach: data.items.map(r => ({
              ten: r.full_name, mo_ta: r.description, sao: r.stargazers_count, ngon_ngu: r.language, url: r.html_url,
            })),
          };
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "gh_get_user": {
        const result = await resilientGitHub("gh_get_user", async () => {
          const { data } = await octokit.users.getAuthenticated();
          return {
            ten_dang_nhap: data.login, ten_hien_thi: data.name, bio: data.bio,
            so_repo_cong_khai: data.public_repos, so_nguoi_theo_doi: data.followers,
            ngay_tao_tai_khoan: data.created_at, url: data.html_url,
          };
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "gh_create_repo": {
        const result = await resilientGitHub("gh_create_repo", async () => {
          const { data } = await octokit.repos.createForAuthenticatedUser({
            name: args.name as string,
            description: (args.description as string) || "",
            private: (args.private as boolean) || false,
            auto_init: true,
          });
          return { ten: data.full_name, url: data.html_url, rieng_tu: data.private };
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "gh_immune_status": {
        const journal = getImmuneJournal();
        const report = {
          trang_thai: journal.length === 0
            ? "KHỎE MẠNH — GitHub MCP chưa gặp lỗi nào."
            : `ĐÃ TỰ CHỮA LÀNH ${journal.length} lần.`,
          so_lan_chua_lanh: journal.length,
          nhat_ky: journal,
        };
        return { content: [{ type: "text", text: JSON.stringify(report, null, 2) }] };
      }

      default:
        throw new Error(`Công cụ không được hỗ trợ: ${request.params.name}`);
    }
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `[GitHub Miễn dịch — Cô lập An toàn] ${error.message}` }],
      isError: true,
    };
  }
});

// ══════════════════════════════════════════════════════════════
//  KHỞI ĐỘNG
// ══════════════════════════════════════════════════════════════
async function main() {
  process.on("uncaughtException", (err) => {
    console.error("[GitHub Miễn dịch Tối thượng] uncaughtException bị chặn:", err.message);
  });
  process.on("unhandledRejection", (reason) => {
    console.error("[GitHub Miễn dịch Tối thượng] unhandledRejection bị chặn:", reason);
  });

  if (!TOKEN) {
    console.error("[CẢNH BÁO] GITHUB_PERSONAL_ACCESS_TOKEN chưa được thiết lập!");
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("GitHub MCP Server v1.0 (Immune System Enabled) is running over stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
