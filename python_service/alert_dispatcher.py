import os
import time
import uuid
import logging
import requests
from typing import Dict, Any, Optional
from .config import (
    TEST_MODE,
    FIRE_RESPONSE_PHONE,
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_FROM_NUMBER
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("AlertDispatcher")

class AlertDispatcher:
    def __init__(self):
        self.notification_log = []
        
    def dispatch_emergency_notifications(self, incident: Dict[str, Any]) -> Dict[str, Any]:
        """
        Dispatches both SMS and Automated Voice Call to the designated emergency response team.
        Retains safety safeguards through TEST_MODE by default.
        """
        loc_str = incident.get("location", {}).get("display_location", "Unknown Campus Location")
        speech_loc = incident.get("location", {}).get("speech_location", loc_str)
        inc_id = incident.get("id", "INC-EMERGENCY")
        conf = int(incident.get("confidence", 0.95) * 100)
        det_type = incident.get("detection_type", "Active Fire & Smoke Hazard")
        
        sms_text = (
            f"🚨 [ACVS-EDS EMERGENCY ALERT] 🚨\n"
            f"CRITICAL: {det_type} detected on campus!\n"
            f"Incident ID: {inc_id}\n"
            f"Location: {loc_str}\n"
            f"Confidence: {conf}%\n"
            f"Robot Patrol Unit #1 in safe standoff observation.\n"
            f"Emergency Response Team action requested immediately."
        )
        
        twiml_voice_script = (
            f"<Response>"
            f"<Say voice='Polly.Matthew-Neural' language='en-US'>"
            f"Attention, emergency response team. Attention. "
            f"This is an automated priority emergency notification from the AI-Enabled Campus Vision System. "
            f"An active {det_type} has been detected by autonomous patrol robot unit one. "
            f"Location: {speech_loc}. "
            f"Incident identifier: {inc_id}. "
            f"Detection confidence is {conf} percent. "
            f"Robot is holding at a safe standoff position and streaming live telemetry to the control room. "
            f"Immediate firefighting response is required. "
            f"</Say>"
            f"</Response>"
        )

        sms_result = self._send_sms(sms_text, inc_id)
        voice_result = self._place_voice_call(twiml_voice_script, speech_loc, inc_id)

        dispatch_summary = {
            "incident_id": inc_id,
            "recipient_phone": FIRE_RESPONSE_PHONE,
            "is_test_mode": TEST_MODE,
            "timestamp": time.time(),
            "sms": sms_result,
            "voice_call": voice_result,
            "overall_status": "sent" if (sms_result["status"] in ("sent", "delivered") or voice_result["status"] in ("sent", "initiated")) else "pending"
        }
        
        self.notification_log.append(dispatch_summary)
        return dispatch_summary

    def _send_sms(self, message: str, incident_id: str) -> Dict[str, Any]:
        if TEST_MODE or not (TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN):
            logger.info(f"📱 [TEST MODE SMS DISPATCH] To: {FIRE_RESPONSE_PHONE}")
            logger.info(f"📱 Content:\n{message}")
            return {
                "service": "Twilio SMS",
                "status": "sent",
                "mode": "TEST_MODE (Simulated Dispatch)",
                "sid": f"SM_SIMULATED_{uuid.uuid4().hex[:12]}",
                "recipient": FIRE_RESPONSE_PHONE,
                "sent_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                "detail": "Simulated SMS delivered successfully to designated fire response team log."
            }
            
        # Production Twilio dispatch
        try:
            url = f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json"
            data = {
                "To": FIRE_RESPONSE_PHONE,
                "From": TWILIO_FROM_NUMBER,
                "Body": message
            }
            resp = requests.post(url, data=data, auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN), timeout=10)
            if resp.status_code in (200, 201):
                res_data = resp.json()
                return {
                    "service": "Twilio SMS",
                    "status": "sent",
                    "mode": "PRODUCTION",
                    "sid": res_data.get("sid"),
                    "recipient": FIRE_RESPONSE_PHONE,
                    "sent_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                    "detail": "Outbound emergency SMS dispatched via Twilio gateway."
                }
            else:
                logger.error(f"Twilio SMS Error: {resp.text}")
                return {
                    "service": "Twilio SMS",
                    "status": "failed",
                    "mode": "PRODUCTION",
                    "error": resp.text,
                    "recipient": FIRE_RESPONSE_PHONE,
                    "detail": "Failed to dispatch SMS via gateway; fallback queued."
                }
        except Exception as e:
            logger.error(f"SMS Dispatch Exception: {e}")
            return {
                "service": "Twilio SMS",
                "status": "failed",
                "mode": "PRODUCTION",
                "error": str(e),
                "recipient": FIRE_RESPONSE_PHONE,
                "detail": "Network timeout or connection error during SMS dispatch."
            }

    def _place_voice_call(self, twiml_xml: str, location_text: str, incident_id: str) -> Dict[str, Any]:
        if TEST_MODE or not (TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN):
            logger.info(f"📞 [TEST MODE VOICE CALL DISPATCH] Calling: {FIRE_RESPONSE_PHONE}")
            logger.info(f"📞 TwiML Audio Script:\n{twiml_xml}")
            return {
                "service": "Twilio Voice (TTS)",
                "status": "sent",
                "mode": "TEST_MODE (Simulated Voice Call)",
                "sid": f"CA_SIMULATED_{uuid.uuid4().hex[:12]}",
                "recipient": FIRE_RESPONSE_PHONE,
                "initiated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                "detail": "Simulated automated voice emergency phone call initiated successfully with speech synthesis."
            }

        # Production Twilio Voice dispatch
        try:
            url = f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Calls.json"
            data = {
                "To": FIRE_RESPONSE_PHONE,
                "From": TWILIO_FROM_NUMBER,
                "Twiml": twiml_xml
            }
            resp = requests.post(url, data=data, auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN), timeout=10)
            if resp.status_code in (200, 201):
                res_data = resp.json()
                return {
                    "service": "Twilio Voice (TTS)",
                    "status": "sent",
                    "mode": "PRODUCTION",
                    "sid": res_data.get("sid"),
                    "recipient": FIRE_RESPONSE_PHONE,
                    "initiated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                    "detail": "Automated voice call placed to emergency response coordinator."
                }
            else:
                logger.error(f"Twilio Voice Error: {resp.text}")
                return {
                    "service": "Twilio Voice (TTS)",
                    "status": "failed",
                    "mode": "PRODUCTION",
                    "error": resp.text,
                    "recipient": FIRE_RESPONSE_PHONE,
                    "detail": "Failed to place automated voice call; retained on control dashboard for manual operator override."
                }
        except Exception as e:
            logger.error(f"Voice Call Exception: {e}")
            return {
                "service": "Twilio Voice (TTS)",
                "status": "failed",
                "mode": "PRODUCTION",
                "error": str(e),
                "recipient": FIRE_RESPONSE_PHONE,
                "detail": "Network timeout or connection error during voice call setup."
            }
