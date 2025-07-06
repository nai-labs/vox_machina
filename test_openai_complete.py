#!/usr/bin/env python3
"""
Comprehensive OpenAI API test to verify the key and Realtime API access
"""
import os
import sys
import json
import time
from pathlib import Path

try:
    import requests
except ImportError:
    print("Installing requests...")
    os.system("pip install --user requests")
    import requests

try:
    from dotenv import load_dotenv
except ImportError:
    print("Installing python-dotenv...")
    os.system("pip install --user python-dotenv")
    from dotenv import load_dotenv

def load_env():
    """Load environment variables from .env file"""
    env_path = Path('.env')
    if env_path.exists():
        load_dotenv(env_path)
        print(f"✅ Loaded .env file from {env_path.absolute()}")
    else:
        print(f"⚠️  No .env file found at {env_path.absolute()}")

def test_basic_api_access():
    """Test basic OpenAI API access"""
    print("\n🔍 Testing Basic OpenAI API Access...")
    
    api_key = os.getenv('OPENAI_API_KEY')
    if not api_key:
        print("❌ OPENAI_API_KEY not found in environment")
        return False
    
    print(f"📋 API Key: {api_key[:12]}...{api_key[-4:]} (length: {len(api_key)})")
    
    # Test models endpoint
    url = "https://api.openai.com/v1/models"
    headers = {"Authorization": f"Bearer {api_key}"}
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            models = [m['id'] for m in data.get('data', [])]
            realtime_models = [m for m in models if 'realtime' in m.lower()]
            
            print(f"✅ API Key Valid! Found {len(models)} models")
            print(f"🎯 Realtime models: {realtime_models}")
            return True
        else:
            print(f"❌ API request failed: {response.status_code}")
            try:
                error = response.json()
                print(f"   Error: {error}")
            except:
                print(f"   Raw response: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Request failed: {e}")
        return False

def test_realtime_sessions():
    """Test OpenAI Realtime Sessions API"""
    print("\n🚀 Testing OpenAI Realtime Sessions API...")
    
    api_key = os.getenv('OPENAI_API_KEY')
    if not api_key:
        print("❌ OPENAI_API_KEY not found")
        return False
    
    url = "https://api.openai.com/v1/realtime/sessions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "gpt-4o-realtime-preview-2024-12-17",
        "voice": "sage",
        "temperature": 0.8,
        "max_response_output_tokens": 4096,
        "instructions": "You are a helpful assistant for testing."
    }
    
    print(f"📡 Making request to: {url}")
    print(f"📦 Payload: {json.dumps(payload, indent=2)}")
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        
        print(f"📊 Response Status: {response.status_code}")
        print(f"📋 Response Headers: {dict(response.headers)}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ SUCCESS! Realtime Sessions API works!")
            print(f"📄 Full Response:")
            print(json.dumps(data, indent=2))
            
            # Check client_secret format
            if 'client_secret' in data:
                client_secret = data['client_secret']
                print(f"\n🔑 Client Secret Analysis:")
                print(f"   Type: {type(client_secret)}")
                
                if isinstance(client_secret, dict):
                    print(f"   Keys: {list(client_secret.keys())}")
                    if 'value' in client_secret:
                        print(f"   Value: {client_secret['value'][:10]}...")
                    if 'expires_at' in client_secret:
                        expires_at = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(client_secret['expires_at']))
                        print(f"   Expires: {expires_at}")
                else:
                    print(f"   Value: {str(client_secret)[:20]}...")
                
                return True
            else:
                print(f"❌ No client_secret in response!")
                print(f"Available keys: {list(data.keys())}")
                return False
                
        else:
            print(f"❌ Realtime Sessions API failed: {response.status_code}")
            try:
                error = response.json()
                print(f"📄 Error Response:")
                print(json.dumps(error, indent=2))
            except:
                print(f"Raw response: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Request failed: {e}")
        return False

def test_server_token_endpoint():
    """Test the local server's /token endpoint"""
    print("\n🌐 Testing Local Server /token Endpoint...")
    
    # Test if server is running
    server_url = "http://localhost:3000"
    
    try:
        # Test basic server connectivity
        response = requests.get(f"{server_url}/token?character=default", timeout=5)
        
        print(f"📊 Server Response Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Server token endpoint works!")
            print(f"📄 Server Response:")
            print(json.dumps(data, indent=2))
            return True
        else:
            print(f"❌ Server token endpoint failed: {response.status_code}")
            try:
                error = response.json()
                print(f"📄 Server Error:")
                print(json.dumps(error, indent=2))
            except:
                print(f"Raw response: {response.text}")
            return False
            
    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to server. Is it running? (npm run dev)")
        return False
    except Exception as e:
        print(f"❌ Server test failed: {e}")
        return False

def main():
    """Run all tests"""
    print("🧪 OpenAI API Comprehensive Test Suite")
    print("=" * 50)
    
    # Load environment
    load_env()
    
    # Run tests
    tests = [
        ("Basic API Access", test_basic_api_access),
        ("Realtime Sessions API", test_realtime_sessions),
        ("Local Server Token Endpoint", test_server_token_endpoint),
    ]
    
    results = []
    for test_name, test_func in tests:
        print(f"\n{'='*20} {test_name} {'='*20}")
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"❌ Test '{test_name}' crashed: {e}")
            results.append((test_name, False))
    
    # Summary
    print(f"\n{'='*50}")
    print("📊 TEST SUMMARY")
    print(f"{'='*50}")
    
    for test_name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status} {test_name}")
    
    passed_count = sum(1 for _, passed in results if passed)
    total_count = len(results)
    
    print(f"\n🎯 Result: {passed_count}/{total_count} tests passed")
    
    if passed_count == total_count:
        print("🎉 All tests passed! Your OpenAI integration should work!")
    else:
        print("💡 Some tests failed. Check the errors above for details.")

if __name__ == "__main__":
    main()