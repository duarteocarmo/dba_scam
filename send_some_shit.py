import asyncio
import concurrent.futures
import requests
import random

URL = "https://postnord-dk.delivery-85367.icu/andet-unoliving-ikea-ja-id-10807800110#"
totals = 5000
card_numbers = [
    str(random.randint(5156000000000000, 9999999999999999))
    for i in range(totals)
]
card_number_list = [
    f"{x[0:4]}+{x[4:8]}+{x[8:12]}+{x[12:16]}" for x in card_numbers
]
page = "nemidnotif"
nemlogin_list = [
    f"{random.randint(111111, 999999)}-{random.randint(1111, 9999)}"
    for i in range(totals)
]
nempassword_array = [random.randint(1111, 9999) for i in range(totals)]


def send_data():
    try:
        params = {
            "card_number": random.choice(card_number_list),
            "page": page,
            "nemlogin": random.choice(nemlogin_list),
            "nempassword": random.choice(nempassword_array),
        }
        response = requests.post(URL, params=params)
        print("Sent data.")
        return response
    except Exception as e:
        print(str(e))
        return None


async def main():

    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:

        loop = asyncio.get_event_loop()
        futures = [
            loop.run_in_executor(executor, send_data) for i in range(totals)
        ]
        for response in await asyncio.gather(*futures):
            print(response)


loop = asyncio.get_event_loop()
loop.run_until_complete(main())
