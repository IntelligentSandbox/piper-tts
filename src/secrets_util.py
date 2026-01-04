import os
import stat
import secrets
import yaml
from log import logger

ROLES = ["admin", "mod", "tts", "push", "pull", "overlay"]
DEFAULT_SECRETS = os.path.join(os.path.dirname(__file__), "private", "secrets.yaml")
_POSSIBLE_CONFIG_PATHS = [
    os.path.join(os.path.dirname(__file__), "private", "config.yaml"),
    os.path.join(os.path.dirname(__file__), "config.yaml"),
    os.path.join(os.path.dirname(os.path.dirname(__file__)), "config.yaml"),
    os.path.join(os.path.dirname(os.path.dirname(__file__)), "private", "config.yaml"),
    os.path.join(os.getcwd(), "config.yaml"),
]
_CONFIG_DIR = os.path.dirname(DEFAULT_SECRETS)
for _p in _POSSIBLE_CONFIG_PATHS:
    if os.path.exists(_p):
        _CONFIG_DIR = os.path.dirname(_p)
        break


def _chmod600(p):
    try:
        os.chmod(p, stat.S_IRUSR | stat.S_IWUSR)
    except:
        pass


def _resolve_path(p: str | None, base_dir: str | None = None) -> str:
    if not p:
        return DEFAULT_SECRETS
    if os.path.isabs(p):
        return p
    if base_dir:
        if not os.path.isabs(base_dir):
            base = os.path.normpath(os.path.join(_CONFIG_DIR, base_dir))
        else:
            base = base_dir
        return os.path.normpath(os.path.join(base, p))
    return os.path.normpath(os.path.join(_CONFIG_DIR, p))


def _read_yaml(p, base_dir: str | None = None):
    rp = _resolve_path(p, base_dir)
    if os.path.exists(rp):
        with open(rp, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    return {}


def _write_yaml(p, data, base_dir: str | None = None):
    rp = _resolve_path(p, base_dir)
    os.makedirs(os.path.dirname(rp) or ".", exist_ok=True)
    with open(rp, "w", encoding="utf-8") as f:
        yaml.safe_dump(data, f, sort_keys=True)
    _chmod600(rp)


def ensure_session_secret(path: str | None = None, base_dir: str | None = None):
    rp = _resolve_path(path, base_dir)
    data = _read_yaml(path, base_dir)
    if "session_secret" not in data:
        data["session_secret"] = secrets.token_urlsafe(48)
        _write_yaml(path, data, base_dir)
        logger.info(f"[session] wrote {rp}")
        logger.info("[session] keep session_secret private")
    return data["session_secret"]


def ensure_keys(auth_cfg: dict, base_dir: str | None = None):
    path = (auth_cfg or {}).get("file") or DEFAULT_SECRETS
    rp = _resolve_path(path, base_dir)
    data = _read_yaml(path, base_dir)
    ks = dict(data.get("keys", {}))
    created = []
    for r in ROLES:
        if r == "mod":
            continue
        if not ks.get(r):
            ks[r] = secrets.token_urlsafe(32)
            created.append(r)
    if created or "keys" not in data:
        data["keys"] = ks
        _write_yaml(path, data, base_dir)
        logger.info(f"[auth] wrote {rp}")
        for r in created:
            logger.info(f"[auth] save this {r} key: {ks[r]}")
    return ks


def ensure_jwt_secret(path: str | None = None, base_dir: str | None = None):
    rp = _resolve_path(path, base_dir)
    data = _read_yaml(path, base_dir)
    if "jwt_secret" not in data:
        data["jwt_secret"] = secrets.token_urlsafe(48)
        _write_yaml(path, data, base_dir)
        logger.info(f"[jwt] wrote {rp}")
        logger.info("[jwt] keep jwt_secret private")
    return data["jwt_secret"]


def get_oauth_provider(
    provider: str, path: str | None = None, base_dir: str | None = None
):
    data = _read_yaml(path, base_dir)
    return (data.get("oauth") or {}).get(provider, {})


def save_oauth_mapping(
    provider: str,
    remote_id: str,
    role: str,
    path: str | None = None,
    base_dir: str | None = None,
):
    rp = _resolve_path(path, base_dir)
    data = _read_yaml(path, base_dir)
    oauth = data.setdefault("oauth", {})
    maps = oauth.setdefault("mappings", {})
    prov = maps.setdefault(provider, {})
    r = str(remote_id)
    if not r.isdigit():
        r = r.lower()
    prov[r] = role
    _write_yaml(path, data, base_dir)


def list_oauth_mappings(
    provider: str | None = None, path: str | None = None, base_dir: str | None = None
):
    data = _read_yaml(path, base_dir)
    maps = (data.get("oauth") or {}).get("mappings") or {}
    if provider:
        return maps.get(provider) or {}
    return maps


def delete_oauth_mapping(
    provider: str, remote_id: str, path: str | None = None, base_dir: str | None = None
):
    rp = _resolve_path(path, base_dir)
    data = _read_yaml(path, base_dir)
    oauth = data.get("oauth") or {}
    maps = oauth.get("mappings") or {}
    prov = maps.get(provider) or {}
    r = str(remote_id)
    if r in prov:
        del prov[r]
        oauth["mappings"] = maps
        data["oauth"] = oauth
        _write_yaml(path, data, base_dir)
        return True
    rl = r.lower()
    if rl in prov:
        del prov[rl]
        oauth["mappings"] = maps
        data["oauth"] = oauth
        _write_yaml(path, data, base_dir)
        return True
    return False
