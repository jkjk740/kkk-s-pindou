# 豆屿 HTTPS 证书

## 2026-10-19 已签发

通过 Let's Encrypt 正式生产 ACME 端点及 DNS-01 验证，分别签发两张 RSA 2048 证书；费用为 0，私钥相互独立。

| 域名 | 用途 | 到期时间（Asia/Shanghai） |
| --- | --- | --- |
| `api.tpejocq.cn` | 小程序后端 API | 2027-01-17 00:01:49 |
| `img.tpejocq.cn` | Aidge 私有 OSS 临时图片 | 2027-01-17 00:05:30 |

颁发者为 `CN=YR1,O=Let's Encrypt,C=US`。已核对每张证书只包含对应域名、证书与私钥匹配、两份私钥不同，并使用当前 Certifi 根证书集合执行 OpenSSL 证书链验证，均成功。这些检查不代表域名 HTTPS 服务已经部署或业务接口通过验收。

两次验证成功后，已删除本次创建的 `_acme-challenge.api` 和 `_acme-challenge.img` TXT 记录，控制台最终显示该域名共 0 条解析记录。未添加业务 A/CNAME，也未覆盖已有解析；删除 TXT 不影响已签发证书的有效性。

私有文件均位于仓库外，私钥权限为 `0600`：

```text
/Users/jkliang/.local/share/pindou-tls/config/live/api.tpejocq.cn/fullchain.pem
/Users/jkliang/.local/share/pindou-tls/config/live/api.tpejocq.cn/privkey.pem
/Users/jkliang/.local/share/pindou-tls/config/live/img.tpejocq.cn/fullchain.pem
/Users/jkliang/.local/share/pindou-tls/config/live/img.tpejocq.cn/privkey.pem
```

`live/` 内文件是指向 `archive/` 的符号链接。私有备份应覆盖完整 `config/` 目录，不应只复制失去目标的链接。不要将私钥、ACME 账户密钥或上述目录加入 Git、前端或聊天。

## 客户端与续签

客户端为从 PyPI 安装在独立虚拟环境的 Certbot 5.8.0，没有修改项目依赖。配置、工作和日志分别在该私有根目录下的 `config/`、`work/`、`logs/`。本次 ACME 账户未填写联系邮箱。

本次使用手动 DNS 验证，没有配置自动续期或定时任务。证书到期前必须重新验证并替换部署端证书；正式部署阶段应补齐自动续签与部署流程。后续可改为受限 DNS 自动化验证，或在适用的后端服务器上使用 HTTP 验证；OSS 图片域名仍需适合其访问链路的验证方式。

手动续签示例（在交互式终端执行；图片域名另运行一次，将两处 `api.tpejocq.cn` 改为 `img.tpejocq.cn`）：

```sh
/Users/jkliang/.local/share/pindou-tls/client/bin/certbot certonly \
  --manual --preferred-challenges dns \
  --key-type rsa --rsa-key-size 2048 \
  --config-dir /Users/jkliang/.local/share/pindou-tls/config \
  --work-dir /Users/jkliang/.local/share/pindou-tls/work \
  --logs-dir /Users/jkliang/.local/share/pindou-tls/logs \
  --server https://acme-v02.api.letsencrypt.org/directory \
  --cert-name api.tpejocq.cn -d api.tpejocq.cn
```

使用当次终端显示的新 TXT 验证值，不复用旧记录。确认公共 DNS 能返回正确值后再按 Enter；成功后清理仅属于本次申请的验证记录。续签本地文件后，还须更新 ECS／OSS 中部署的证书。

## 待备案通过后的部署

域名 `tpejocq.cn` 的网站 ICP 申请仍处于管局审核阶段。本次未将业务 A/CNAME 解析指向 ECS／OSS，未向云端上传私钥，未在服务器或 OSS 配置证书，未启用 AI。

备案通过后，再完成 API 的 ECS HTTPS 部署，以及 OSS 绑定 `img.tpejocq.cn`、按控制台给出的目标配置 CNAME、托管对应证书。OSS 必须先绑定域名，再配置业务 CNAME。随后更新后端的 `CUTOUT_OSS_ENDPOINT`；真实上传与 AI 调用仍遵循用户授权范围。

微信小程序备案是独立状态：用户提供的通知显示小程序于 2026-10-10 通过管局审核，通知中的 AppID 与本项目 `src/manifest.json` 一致，无需重复申请。未访问或操作受浏览器权限限制的微信后台。

参考：[Let's Encrypt DNS-01](https://letsencrypt.org/docs/challenge-types/#dns-01-challenge)、[Certbot 手动验证与续签](https://eff-certbot.readthedocs.io/en/stable/using.html#manual)、[OSS HTTPS 配置](https://help.aliyun.com/zh/oss/user-guide/access-oss-by-https-protocol)。
