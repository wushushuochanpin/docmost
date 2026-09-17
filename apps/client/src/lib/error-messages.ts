/**
 * Maps backend ErrorCode values to Chinese user-facing messages.
 * Used by the API error handler to display localized error messages.
 */
import { ErrorCode } from "@/../server/src/common/errors/error-codes";

export const errorMessagesZhCN: Partial<Record<string, string>> = {
  // Auth
  [ErrorCode.AUTH_INVALID_CREDENTIALS]: "邮箱或密码不正确",
  [ErrorCode.AUTH_USER_DISABLED]: "账户已被禁用",
  [ErrorCode.AUTH_EMAIL_NOT_VERIFIED]: "邮箱尚未验证",
  [ErrorCode.AUTH_TOKEN_INVALID]: "登录已过期，请重新登录",
  [ErrorCode.AUTH_TOKEN_EXPIRED]: "登录已过期，请重新登录",
  [ErrorCode.AUTH_PASSWORD_MISMATCH]: "两次输入的密码不一致",
  [ErrorCode.AUTH_SETUP_ALREADY_COMPLETED]: "工作区已完成初始化",
  [ErrorCode.AUTH_SETUP_IN_PROGRESS]: "工作区初始化进行中",
  [ErrorCode.AUTH_MFA_UNAVAILABLE]: "多因素认证不可用",
  [ErrorCode.AUTH_SSO_ENFORCED]: "请使用单点登录",

  // User
  [ErrorCode.USER_NOT_FOUND]: "用户不存在",
  [ErrorCode.USER_EMAIL_EXISTS]: "该邮箱已被使用",

  // Workspace
  [ErrorCode.WORKSPACE_NOT_FOUND]: "工作区不存在",

  // Space
  [ErrorCode.SPACE_NOT_FOUND]: "空间不存在",
  [ErrorCode.SPACE_SLUG_EXISTS]: "空间标识已被占用",

  // Page
  [ErrorCode.PAGE_NOT_FOUND]: "页面不存在",
  [ErrorCode.PARENT_PAGE_NOT_FOUND]: "父页面不存在",
  [ErrorCode.PAGE_INVALID_MOVE_POSITION]: "无效的移动位置",
  [ErrorCode.PAGE_MOVE_CYCLE]: "不能将页面移动到自身的子页面下",
  [ErrorCode.PAGE_MOVE_NAME_CONFLICT]: "目标位置已存在同名页面",

  // Share
  [ErrorCode.SHARE_NOT_FOUND]: "分享链接不存在",
  [ErrorCode.SHARE_EXPIRED]: "分享链接已过期",
  [ErrorCode.SHARE_PASSWORD_REQUIRED]: "需要密码才能访问",
  [ErrorCode.SHARE_PASSWORD_INVALID]: "密码错误",
  [ErrorCode.SHARE_ACCESS_TOKEN_INVALID]: "访问令牌无效",
  [ErrorCode.SHARE_ACCESS_MODE_FORBIDDEN]: "分享模式不允许此操作",
  [ErrorCode.SHARE_TTL_INVALID]: "分享有效期必须在 1 到 30 分钟之间",
  [ErrorCode.SHARE_REGENERATE_REQUIRED]: "请重新生成受保护的分享链接",
  [ErrorCode.SHARE_VERIFY_RATE_LIMITED]: "验证次数过多，请稍后重试",

  // Editor Session
  [ErrorCode.EDITOR_SESSION_CONFLICT]: "编辑会话冲突",
  [ErrorCode.EDITOR_SESSION_FORBIDDEN]: "无权访问此编辑会话",
  [ErrorCode.EDITOR_SESSION_RESOURCE_NOT_FOUND]: "编辑会话资源不存在",

  // Sidebar Category
  [ErrorCode.SIDEBAR_CATEGORY_LIMIT_EXCEEDED]: "侧边栏分类数量已达上限",
  [ErrorCode.SIDEBAR_CATEGORY_NAME_DUPLICATED]: "侧边栏分类名称重复",
  [ErrorCode.SIDEBAR_CATEGORY_NOT_FOUND]: "侧边栏分类不存在",
  [ErrorCode.SIDEBAR_CATEGORIES_NOT_FOUND]: "侧边栏分类未找到",
  [ErrorCode.SIDEBAR_CATEGORY_REORDER_INVALID]: "无效的排序操作",
  [ErrorCode.CATEGORY_SPACE_MISMATCH]: "分类与空间不匹配",
  [ErrorCode.ROOT_NODE_ONLY_CATEGORY_ASSIGNMENT]: "仅根节点可分配分类",

  // Migration
  [ErrorCode.MIGRATION_ALREADY_RUNNING]: "迁移任务已在运行中",

  // Generic
  [ErrorCode.VALIDATION_ERROR]: "输入数据验证失败",
  [ErrorCode.FORBIDDEN]: "无权执行此操作",
  [ErrorCode.INTERNAL_ERROR]: "服务器内部错误",
};

/**
 * Get a Chinese user-facing message for a backend error code.
 * Falls back to the server-provided English message if no translation exists.
 */
export function getErrorMessageZhCN(
  code: string | undefined,
  fallbackMessage: string,
): string {
  if (code && errorMessagesZhCN[code]) {
    return errorMessagesZhCN[code];
  }
  return fallbackMessage;
}
