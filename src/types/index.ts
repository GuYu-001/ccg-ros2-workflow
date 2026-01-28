// 支持的语言
export type SupportedLang = 'zh-CN' | 'en'

// 模型类型
export type ModelType = 'codex' | 'gemini' | 'claude'

// 协作模式
export type CollaborationMode = 'parallel' | 'smart' | 'sequential'

// 路由策略
export type RoutingStrategy = 'parallel' | 'fallback' | 'round-robin'

// 模型路由配置 (ROS2: 上层应用 = Launch/Python/RViz, 底层控制 = C++/Hardware/Realtime)
export interface ModelRouting {
  frontend: {  // ROS2: 上层应用 (Upper-layer Application)
    models: ModelType[]
    primary: ModelType
    strategy: RoutingStrategy
  }
  backend: {   // ROS2: 底层控制 (Low-level Control)
    models: ModelType[]
    primary: ModelType
    strategy: RoutingStrategy
  }
  review: {
    models: ModelType[]
    strategy: 'parallel'
  }
  mode: CollaborationMode
}

// CCG 配置 (ROS2 版本)
export interface CcgConfig {
  general: {
    version: string
    language: SupportedLang
    createdAt: string
  }
  ros2: {  // ROS2 特有配置
    distro: string      // 例如: humble, jazzy, rolling
    target: string      // 例如: physical_robot, simulation, desktop
  }
  routing: ModelRouting
  workflows: {
    installed: string[]
  }
  paths: {
    commands: string
    prompts: string
    backup: string
  }
  mcp: {
    provider: string
    setup_url: string
  }
  performance?: {
    liteMode?: boolean // 轻量模式：禁用 Web UI，更快响应
  }
}

// 工作流定义
export interface WorkflowConfig {
  id: string
  name: string
  nameEn: string
  category: string
  commands: string[]
  defaultSelected: boolean
  order: number
  description?: string
  descriptionEn?: string
}

// 初始化选项
export interface InitOptions {
  lang?: SupportedLang
  skipPrompt?: boolean
  skipMcp?: boolean // 更新时跳过 MCP 配置
  force?: boolean
  // 非交互模式参数
  frontend?: string
  backend?: string
  mode?: CollaborationMode
  workflows?: string
  installDir?: string
}

// 安装结果
export interface InstallResult {
  success: boolean
  installedCommands: string[]
  installedPrompts: string[]
  errors: string[]
  configPath: string
  binPath?: string
  binInstalled?: boolean
}

// ace-tool 配置
export interface AceToolConfig {
  baseUrl: string
  token: string
}

// Re-export CLI types
export * from './cli'
