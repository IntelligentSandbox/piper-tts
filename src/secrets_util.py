import os
import stat
import secrets
import yaml

ROLES = ["admin", "mod", "tts", "push", "pull", "overlay"]


def _chmod600(p):
    try:
        os.chmod(p, stat.S_IRUSR | stat.S_IWUSR)
    except:
        pass


def _read_yaml(p):
    # default to ./secrets.yaml when callers pass None or a falsy path
    if not p:
        p = "./secrets.yaml"
    if os.path.exists(p):
        with open(p, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    return {}


def _write_yaml(p, data):
    # default to ./secrets.yaml when callers pass None or a falsy path
    if not p:
        p = "./secrets.yaml"
    os.makedirs(os.path.dirname(p) or ".", exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        yaml.safe_dump(data, f, sort_keys=True)
    _chmod600(p)


def ensure_session_secret(path="./secrets.yaml"):
    data = _read_yaml(path)
    if "session_secret" not in data:
        data["session_secret"] = secrets.token_urlsafe(48)
        _write_yaml(path, data)
        print(f"[session] wrote {path}")
        print("[session] keep session_secret private")
    return data["session_secret"]


def ensure_keys(auth_cfg: dict):
    path = (auth_cfg or {}).get("file") or "./secrets.yaml"
    data = _read_yaml(path)
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
        _write_yaml(path, data)
        print(f"[auth] wrote {path}")
        for r in created:
            print(f"[auth] save this {r} key: {ks[r]}")
    return ks


def ensure_jwt_secret(path="./secrets.yaml"):
    data = _read_yaml(path)
    if "jwt_secret" not in data:
        data["jwt_secret"] = secrets.token_urlsafe(48)
        _write_yaml(path, data)
        print(f"[jwt] wrote {path}")
        print("[jwt] keep jwt_secret private")
    return data["jwt_secret"]


def get_oauth_provider(provider: str, path: str = "./secrets.yaml"):
    """Return oauth provider config (client_id, client_secret) from secrets file.

    Expected structure in secrets.yaml:
    oauth:
      twitch:
        client_id: "..."
        client_secret: "..."
        redirect_uri: "https://yourhost/api/auth/callback"
    """
    data = _read_yaml(path)
    return (data.get("oauth") or {}).get(provider, {})


def save_oauth_mapping(
    provider: str, remote_id: str, role: str, path: str = "./secrets.yaml"
):
    data = _read_yaml(path)
    oauth = data.setdefault("oauth", {})
    maps = oauth.setdefault("mappings", {})
    prov = maps.setdefault(provider, {})
    r = str(remote_id)
    if not r.isdigit():
        r = r.lower()
    prov[r] = role
    _write_yaml(path, data)


def list_oauth_mappings(provider: str | None = None, path: str = "./secrets.yaml"):
    data = _read_yaml(path)
    maps = (data.get("oauth") or {}).get("mappings") or {}
    if provider:
        return maps.get(provider) or {}
    return maps


def delete_oauth_mapping(provider: str, remote_id: str, path: str = "./secrets.yaml"):
    data = _read_yaml(path)
    oauth = data.get("oauth") or {}
    maps = oauth.get("mappings") or {}
    prov = maps.get(provider) or {}
    r = str(remote_id)
    if r in prov:
        del prov[r]
        oauth["mappings"] = maps
        data["oauth"] = oauth
        _write_yaml(path, data)
        return True
    # try lower-case key for username-style keys
    rl = r.lower()
    if rl in prov:
        del prov[rl]
        oauth["mappings"] = maps
        data["oauth"] = oauth
        _write_yaml(path, data)
        return True
    return False
