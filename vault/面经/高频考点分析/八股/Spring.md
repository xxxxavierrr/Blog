# Spring

1. **SpringBoot框架介绍、优缺点**

Spring Boot是基于Spring的快速开发框架，能够

    - 快速构建项目
    - 内置了多种 Web 容器，如 Tomcat，并且默认提供 HTTP 服务
    - 根据引入的依赖starter提供一些默认的配置，避免大量的Maven导入和各种版本冲突

缺点：

    - 自动配置可能与定制化业务需求冲突，需手动调整或关闭自动配置
    - 自动配置类较多，可能引入未使用依赖，导致启动时间较长
2. **说一下微服务架构**

微服务是一种软件架构风格，将一个大型应用程序划分为一组小型、自治且松耦合的服务，是SOA（面向服务架构）的一种具体实现方式。每个微服务负责执行特定的业务功能，并通过轻量级通信机制（如 HTTP）相互协作。每个微服务可以独立开发、部署和扩展，使得应用程序更加灵活、可伸缩和可维护。目前三种主流解决方案为Dubbo、Spring Cloud Netflix、Spring Cloud Alibaba。

3. **Spring过滤器拦截器区别**

过滤器（Filter）

    - 过滤器是Servlet规范中的一部分，它在Spring框架之外，由Servlet容器（如Tomcat）管理。
    - 过滤器在请求到达Servlet之前执行，并且可以在响应返回给客户端之前执行。
    - 过滤器通常用于执行一些跨多个请求和响应的任务，如日志记录、身份验证、编码转换等。
    - 过滤器通过实现javax.servlet.Filter接口来定义。

拦截器（Interceptor）

    - 拦截器是Spring框架的一部分，它依赖于Spring的AOP模块。
    - 拦截器在Spring的DispatcherServlet中工作，用于拦截请求并在控制器之前或之后执行。
    - 拦截器通常用于记录日志、执行安全检查、数据绑定等操作。
    - 拦截器通过实现org.springframework.web.servlet.HandlerInterceptor接口或扩展org.springframework.web.servlet.handler.HandlerInterceptorAdapter类来定义
4. **对某些路径比如用户登录进行校验拦截怎么做**

```java
@Configuration
public class FilterConfig {

    @Bean
    public FilterRegistrationBean<LoginFilter> loginFilterRegistration() {
        FilterRegistrationBean<LoginFilter> registration = new FilterRegistrationBean<>();
        registration.setFilter(new LoginFilter());
        registration.addUrlPatterns("/*"); // 拦截所有请求
        registration.setName("loginFilter");
        registration.setOrder(1); // 设置Filter执行顺序
        return registration;
    }
}

public class LoginFilter implements Filter {

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain) 
            throws IOException, ServletException {
        
        // 转换为HTTP请求/响应
        HttpServletRequest httpRequest = (HttpServletRequest) request;
        HttpServletResponse httpResponse = (HttpServletResponse) response;
        
        // 获取请求路径
        String uri = httpRequest.getRequestURI();
        
        // 排除不需要验证的路径（如登录页面、静态资源）
        if (uri.endsWith("/login") || uri.endsWith("/register") || 
            uri.contains("/static/") || uri.contains("/js/") || uri.contains("/css/")) {
            chain.doFilter(request, response); // 放行请求
            return;
        }
        
        // 检查Session中是否有用户信息（假设登录成功后会设置user属性）
        HttpSession session = httpRequest.getSession(false);
        if (session == null || session.getAttribute("user") == null) {
            // 未登录，重定向到登录页面
            httpResponse.sendRedirect("/login");
            return;
        }
        
        // 已登录，继续处理请求
        chain.doFilter(request, response);
    }
}
```

5. **用户登录 权限验证怎么实现**

第一层（Filter）：快速校验 Token 有效性，提取基本用户信息

第二层（Interceptor）：基于用户角色 / 权限进行业务逻辑校验

第三层（AOP）：针对特定方法进行额外切面增强

```java
@Configuration
public class WebConfig implements WebMvcConfigurer {
    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new AuthInterceptor())
                .addPathPatterns("/api/**") // 拦截所有API路径
                .excludePathPatterns("/api/auth/login", "/api/auth/register"); // 排除登录、注册接口
    }
}

public class AuthInterceptor implements HandlerInterceptor {
    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        // 校验逻辑：从请求头获取Token，验证有效性
        String token = request.getHeader("Authorization");
        if (token == null || !validateToken(token)) {
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "未认证");
            return false; // 拦截
        }
        return true; // 校验通过，继续执行
    }
}
```

6. **Spring多环境配置 dev环境 prod环境**

```yaml
# application.yml（公共配置）
spring:
  datasource:
    driver-class-name: com.mysql.cj.jdbc.Driver
  profiles:
    active: dev #prod
---
# application-dev.yml（开发环境）
spring:
  profiles: dev
  datasource:
    url: jdbc:mysql://localhost:3306/dev_db
---
# application-prod.yml（生产环境）
spring:
  profiles: prod
  datasource:
    url: jdbc:mysql://prod-db:3306/prod_db
```

7. **@RestController @Controller区别**

@RestController=@Controller+@ResponseBody

@Controller返回视图（如 Thymeleaf 页面）

@ResponseBody自动将方法返回值序列化为JSON/XML等格式

8. **前后端分离和不分离 前端视图是怎么返回的**

前后端不分离：后端负责生成完整的 HTML 页面，前端仅作为静态资源（JS/CSS）存在。

前后端分离：后端仅返回 JSON/XML 数据，前端通过独立的 SPA 应用（如 Vue/React）动态渲染页面



> 更新: 2025-05-22 01:27:15  
> 原文: <https://www.yuque.com/yunzishuo-b4wkj/op8mqg/kavhcq6v0nka5ce9>