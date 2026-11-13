"""HITS authorization code callback and mandatory local password setup."""
import base64
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
import httpx
import jwt
from fastapi import Cookie, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field, EmailStr
from sqlalchemy.exc import IntegrityError
from .db import Session, User
from .sso_models import ExternalIdentity
from .sso_accounts import prepare_registration, finish_registration, RegistrationError


def install(app):
    from .main import cfg, db, password_hash, set_session
    @app.middleware("http")
    async def private_sso_responses(request, call_next):
        result = await call_next(request)
        if request.url.path.startswith("/api/auth/hits/"):
            result.headers["Cache-Control"] = "no-store"
            result.headers["Referrer-Policy"] = "no-referrer"
        return result

    def enabled():
        if not cfg.hits_base_url or not cfg.hits_client_secret or not cfg.hits_callback_url:
            raise HTTPException(503, 'HITS 登录尚未配置')
    def cookie(response, name, value, age=600):
        response.set_cookie(name, value, max_age=age, httponly=True,
                            secure=cfg.cookie_secure, samesite='lax', path='/')
    def clear(response):
        for name in ('hits_flow', 'hits_pending'):
            response.delete_cookie(name, path='/', secure=cfg.cookie_secure, httponly=True, samesite='lax')
    def decode(value, purpose):
        try:
            data=jwt.decode(value or '', cfg.jwt_secret, algorithms=['HS256'], audience=purpose,
                            options={'require':['exp','aud']})
            return data
        except jwt.InvalidTokenError:
            raise HTTPException(400, '授权已失效，请重新使用 HITS 登录')

    @app.get('/api/auth/hits/start')
    def start():
        enabled()
        state=secrets.token_urlsafe(32); verifier=secrets.token_urlsafe(48)
        challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
        params=dict(client_id=cfg.hits_client_id,redirect_uri=cfg.hits_callback_url,
                    response_type='code',scope='email',state=state,
                    code_challenge=challenge,code_challenge_method='S256')
        response=RedirectResponse(cfg.hits_base_url.rstrip('/')+'/aibox/oauth/authorize?'+urlencode(params),302)
        cookie(response,'hits_flow',jwt.encode(dict(aud='hits-flow',state=state,verifier=verifier,
              exp=datetime.now(timezone.utc)+timedelta(minutes=10)),cfg.jwt_secret,algorithm='HS256'))
        return response

    @app.get('/api/auth/hits/callback')
    def callback(code:str='', state:str='', error:str='', hits_flow:str|None=Cookie(default=None), session=Depends(db)):
        enabled(); flow=decode(hits_flow,'hits-flow')
        if not state or not secrets.compare_digest(state,flow.get('state','')):
            raise HTTPException(400,'授权状态校验失败，请重新登录')
        if error or not code:
            response=RedirectResponse('/login?hits_error=denied',302);clear(response);return response
        try:
            with httpx.Client(timeout=15,follow_redirects=False) as client:
                token=client.post(cfg.hits_base_url.rstrip('/')+'/aibox/oauth/token',
                    auth=(cfg.hits_client_id,cfg.hits_client_secret),data=dict(grant_type='authorization_code',
                    code=code,redirect_uri=cfg.hits_callback_url,code_verifier=flow['verifier']))
                token.raise_for_status(); access=token.json()['access_token']
                info=client.get(cfg.hits_base_url.rstrip('/')+'/aibox/oauth/userinfo',headers={'Authorization':'Bearer '+access})
                info.raise_for_status(); identity=info.json()
                from pydantic import TypeAdapter
                email=str(TypeAdapter(EmailStr).validate_python(identity['email']))
                subject=identity['sub']
                if identity.get('email_verified') is not True or not isinstance(subject,str) or not 1<=len(subject)<=128:
                    raise ValueError()
        except (httpx.HTTPError,ValueError,KeyError,TypeError):
            raise HTTPException(400,'HITS 授权验证失败，请重新登录')
        existing=session.get(ExternalIdentity,('hits',subject))
        response=RedirectResponse('/create' if existing else '/auth/hits/setup',302);clear(response)
        if existing:
            user=session.get(User,existing.user_id)
            if not user: raise HTTPException(400,'绑定账号不存在')
            set_session(response,user)
        else:
            pending=prepare_registration(session,'hits',subject,email);session.commit()
            cookie(response,'hits_pending',pending)
        return response

    @app.get('/api/auth/hits/pending')
    def pending(hits_pending:str|None=Cookie(default=None),session=Depends(db)):
        from .sso_models import PendingExternalRegistration
        from .sso_accounts import registration_digest
        from .db import utcnow
        row=session.get(PendingExternalRegistration,registration_digest(hits_pending or ''))
        if not row or row.expires_at<=utcnow():raise HTTPException(400,'授权已过期，请重新登录')
        existing=session.query(User).filter(User.email==row.email).first()
        return {'email':row.email,'existing_account':bool(existing)}

    class Complete(BaseModel):
        password:str=Field(min_length=8,max_length=128)
        confirm_password:str=Field(min_length=8,max_length=128)

    @app.post('/api/auth/hits/complete')
    def complete(data:Complete,response:Response,request:Request,hits_pending:str|None=Cookie(default=None),session=Depends(db)):
        # Require a browser origin to protect the password/setup operation.
        origin=request.headers.get('origin','').rstrip('/')
        if not origin or origin not in {x.strip().rstrip('/') for x in cfg.cors_origins.split(',')}:
            raise HTTPException(403,'请求来源不允许')
        if data.password!=data.confirm_password:raise HTTPException(422,'两次密码不一致')
        try:
            user=finish_registration(session,hits_pending or '',data.password,password_hash.hash)
            session.commit()
        except RegistrationError as exc:
            session.rollback();raise HTTPException(409,str(exc))
        except IntegrityError:
            session.rollback();raise HTTPException(409,'账号已存在，请重新登录')
        clear(response);set_session(response,user)
        return {'id':user.id,'email':user.email}

    class Bind(BaseModel):
        password: str = Field(min_length=8,max_length=128)

    @app.post('/api/auth/hits/bind')
    def bind(data:Bind,response:Response,request:Request,hits_pending:str|None=Cookie(default=None),session=Depends(db)):
        from sqlalchemy import select
        from .db import utcnow
        from .sso_models import PendingExternalRegistration
        from .sso_accounts import registration_digest
        origin=request.headers.get('origin','').rstrip('/')
        if not origin or origin not in {x.strip().rstrip('/') for x in cfg.cors_origins.split(',')}:
            raise HTTPException(403,'请求来源不允许')
        row=session.scalar(select(PendingExternalRegistration).where(PendingExternalRegistration.token_hash==registration_digest(hits_pending or '')).with_for_update())
        if not row or row.expires_at<=utcnow():raise HTTPException(400,'授权已过期，请重新登录')
        if row.failed_attempts >= 5:raise HTTPException(429,'尝试次数过多，请重新使用 HITS 授权')
        user=session.scalar(select(User).where(User.email==row.email).with_for_update())
        if not user or not password_hash.verify(data.password,user.password_hash):
            row.failed_attempts += 1
            session.commit()
            raise HTTPException(401,'原 AIBox 密码不正确')
        if session.get(ExternalIdentity,('hits',row.subject)):
            raise HTTPException(409,'此 HITS 账号已绑定，请重新登录')
        session.add(ExternalIdentity(provider='hits',subject=row.subject,user_id=user.id));session.delete(row)
        try:session.commit()
        except IntegrityError:
            session.rollback();raise HTTPException(409,'账号已绑定，请重新登录')
        clear(response);set_session(response,user)
        return {'id':user.id,'email':user.email}
