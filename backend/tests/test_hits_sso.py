import os
import pytest
from test_api import setup, client, register


@pytest.mark.skipif(not os.environ.get("HITS_TEST_PROVIDER_URL"), reason="requires isolated HITS test provider")
def test_hits_cross_site_password_setup_and_login(client, monkeypatch):
    """Requires isolated HITS test provider on 18555; never uses real HITS accounts."""
    import httpx
    import re
    from urllib.parse import urlsplit
    from app import main
    monkeypatch.setattr(main.cfg,'hits_base_url',os.environ['HITS_TEST_PROVIDER_URL'])
    monkeypatch.setattr(main.cfg,'hits_client_secret','s'*40)
    monkeypatch.setattr(main.cfg,'hits_callback_url','http://localhost:3001/api/auth/hits/callback')
    def authorize():
        start=client.get('/api/auth/hits/start',follow_redirects=False)
        assert start.status_code==302
        with httpx.Client(follow_redirects=False) as browser:
            page=browser.get(start.headers['location'])
            assert page.status_code==200,page.text
            csrf=re.search(r'name="csrf" value="([^"]+)"',page.text).group(1)
            auth=browser.post(start.headers['location'],data=dict(csrf=csrf,username='test',password='password',decision='allow'))
            assert auth.status_code==302,auth.text
            callback=urlsplit(auth.headers['location'])
            return client.get(callback.path+'?'+callback.query,follow_redirects=False)
    first=authorize()
    assert first.status_code==302,first.text
    assert first.headers['location']=='/auth/hits/setup'
    assert client.get('/api/auth/me').status_code==401
    assert client.get('/api/auth/hits/pending').json()['email']=='test@example.com'
    headers={'Origin':'http://localhost:3001'}
    assert client.post('/api/auth/hits/complete',headers=headers,json=dict(password='new-password',confirm_password='different-password')).status_code==422
    result=client.post('/api/auth/hits/complete',headers=headers,json=dict(password='new-password',confirm_password='new-password'))
    assert result.status_code==200,result.text
    user_id=result.json()['id']
    assert client.get('/api/auth/me').json()['id']==user_id
    assert client.post('/api/auth/hits/complete',headers=headers,json=dict(password='new-password',confirm_password='new-password')).status_code==409
    client.post('/api/auth/logout')
    assert client.post('/api/auth/login',json=dict(email='test@example.com',password='new-password')).status_code==200
    client.post('/api/auth/logout')
    again=authorize();assert again.headers['location']=='/create',again.text
    assert client.get('/api/auth/me').json()['id']==user_id
    bad=client.get('/api/auth/hits/callback?state=bad&code=bad',follow_redirects=False)
    assert bad.status_code==400


@pytest.mark.skipif(not os.environ.get('HITS_TEST_PROVIDER_URL'),reason='requires isolated HITS provider')
def test_hits_existing_email_requires_original_password(client,monkeypatch):
    import httpx,re
    from urllib.parse import urlsplit
    from app import main
    monkeypatch.setattr(main.cfg,'hits_base_url',os.environ['HITS_TEST_PROVIDER_URL'])
    monkeypatch.setattr(main.cfg,'hits_client_secret','s'*40)
    monkeypatch.setattr(main.cfg,'hits_callback_url','http://localhost:3001/api/auth/hits/callback')
    register(client)
    original=client.get('/api/auth/me').json()['id'];client.post('/api/auth/logout')
    start=client.get('/api/auth/hits/start',follow_redirects=False)
    with httpx.Client(follow_redirects=False) as browser:
        page=browser.get(start.headers['location']);csrf=re.search(r'name="csrf" value="([^"]+)"',page.text).group(1)
        auth=browser.post(start.headers['location'],data=dict(csrf=csrf,username='test',password='password',decision='allow'))
    callback=urlsplit(auth.headers['location']);client.get(callback.path+'?'+callback.query,follow_redirects=False)
    assert client.get('/api/auth/hits/pending').json()['existing_account'] is True
    headers={'Origin':'http://localhost:3001'}
    assert client.post('/api/auth/hits/complete',headers=headers,json=dict(password='new-password',confirm_password='new-password')).status_code==409
    assert client.post('/api/auth/hits/bind',headers=headers,json={'password':'wrong-password'}).status_code==401
    assert client.post('/api/auth/hits/bind',headers=headers,json={'password':'password123'}).status_code==200
    assert client.get('/api/auth/me').json()['id']==original
