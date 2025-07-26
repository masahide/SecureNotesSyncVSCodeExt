// src/container/ServiceContainer.ts

/**
 * サービスの登録タイプ
 */
export enum ServiceLifetime {
  /** 毎回新しいインスタンスを作成 */
  Transient = 'transient',
  /** 単一インスタンスを共有 */
  Singleton = 'singleton',
  /** スコープ内で単一インスタンスを共有 */
  Scoped = 'scoped'
}

/**
 * サービス登録情報
 */
interface ServiceRegistration<T = any> {
  factory: (...args: any[]) => T;
  lifetime: ServiceLifetime;
  instance?: T;
  dependencies?: string[];
}

/**
 * 依存性注入コンテナ
 */
export class ServiceContainer {
  private services = new Map<string, ServiceRegistration>();
  private scopedInstances = new Map<string, any>();
  private isDisposed = false;

  /**
   * サービスを一時的なライフタイムで登録
   */
  registerTransient<T>(key: string, factory: (...args: any[]) => T, dependencies: string[] = []): void {
    this.validateKey(key);
    this.services.set(key, {
      factory,
      lifetime: ServiceLifetime.Transient,
      dependencies
    });
  }

  /**
   * サービスをシングルトンとして登録
   */
  registerSingleton<T>(key: string, factory: (...args: any[]) => T, dependencies: string[] = []): void {
    this.validateKey(key);
    this.services.set(key, {
      factory,
      lifetime: ServiceLifetime.Singleton,
      dependencies
    });
  }

  /**
   * サービスをスコープドとして登録
   */
  registerScoped<T>(key: string, factory: (...args: any[]) => T, dependencies: string[] = []): void {
    this.validateKey(key);
    this.services.set(key, {
      factory,
      lifetime: ServiceLifetime.Scoped,
      dependencies
    });
  }

  /**
   * インスタンスを直接登録（シングルトンとして）
   */
  registerInstance<T>(key: string, instance: T): void {
    this.validateKey(key);
    this.services.set(key, {
      factory: () => instance,
      lifetime: ServiceLifetime.Singleton,
      instance
    });
  }

  /**
   * サービスを解決
   */
  resolve<T>(key: string): T {
    if (this.isDisposed) {
      throw new Error('Container has been disposed');
    }

    const registration = this.services.get(key);
    if (!registration) {
      throw new Error(`Service '${key}' is not registered`);
    }

    return this.createInstance<T>(key, registration);
  }

  /**
   * サービスが登録されているかチェック
   */
  isRegistered(key: string): boolean {
    return this.services.has(key);
  }

  /**
   * スコープを作成
   */
  createScope(): ServiceScope {
    return new ServiceScope(this);
  }

  /**
   * コンテナを破棄
   */
  dispose(): void {
    // シングルトンインスタンスの破棄
    for (const [key, registration] of this.services) {
      if (registration.instance && typeof registration.instance.dispose === 'function') {
        registration.instance.dispose();
      }
    }

    // スコープドインスタンスの破棄
    for (const [key, instance] of this.scopedInstances) {
      if (typeof instance.dispose === 'function') {
        instance.dispose();
      }
    }

    this.services.clear();
    this.scopedInstances.clear();
    this.isDisposed = true;
  }

  /**
   * インスタンスを作成
   */
  private createInstance<T>(key: string, registration: ServiceRegistration<T>): T {
    switch (registration.lifetime) {
      case ServiceLifetime.Singleton:
        if (!registration.instance) {
          registration.instance = this.instantiate(registration);
        }
        return registration.instance;

      case ServiceLifetime.Scoped:
        if (!this.scopedInstances.has(key)) {
          this.scopedInstances.set(key, this.instantiate(registration));
        }
        return this.scopedInstances.get(key);

      case ServiceLifetime.Transient:
      default:
        return this.instantiate(registration);
    }
  }

  /**
   * 依存関係を解決してインスタンスを作成
   */
  private instantiate<T>(registration: ServiceRegistration<T>): T {
    const dependencies = registration.dependencies || [];
    const resolvedDependencies = dependencies.map(dep => this.resolve(dep));
    return registration.factory(...resolvedDependencies);
  }

  /**
   * キーの妥当性を検証
   */
  private validateKey(key: string): void {
    if (!key || typeof key !== 'string') {
      throw new Error('Service key must be a non-empty string');
    }
  }
}

/**
 * サービススコープ
 */
export class ServiceScope {
  private scopedInstances = new Map<string, any>();
  private isDisposed = false;

  constructor(private container: ServiceContainer) {}

  /**
   * スコープ内でサービスを解決
   */
  resolve<T>(key: string): T {
    if (this.isDisposed) {
      throw new Error('Scope has been disposed');
    }

    const registration = (this.container as any).services.get(key);
    if (!registration) {
      throw new Error(`Service '${key}' is not registered`);
    }

    if (registration.lifetime === ServiceLifetime.Scoped) {
      if (!this.scopedInstances.has(key)) {
        this.scopedInstances.set(key, (this.container as any).instantiate(registration));
      }
      return this.scopedInstances.get(key);
    }

    return this.container.resolve<T>(key);
  }

  /**
   * スコープを破棄
   */
  dispose(): void {
    for (const [key, instance] of this.scopedInstances) {
      if (typeof instance.dispose === 'function') {
        instance.dispose();
      }
    }
    this.scopedInstances.clear();
    this.isDisposed = true;
  }
}